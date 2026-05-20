## Что уже понятно по фактам

Проблема не в том, что сообщения «не отображаются» в чате. Они реально не уходят.

Проверка backend на 20 мая, Dubai time:

- **FB Media**: 33 получателя в статусе `scheduled`, все уже должны были уйти примерно с **11:19 до 11:43 GST**, но `sent = 0`, `failed = 0`.
- **fitpreneur**: 1090 получателей в статусе `scheduled`, все уже должны были уйти примерно с **11:19 до 12:24 GST**, но `sent = 0`, `failed = 0`.
- Номера у fitpreneur выглядят рабочими: `ready`, не paused, есть app id и API key.
- Глобальный kill switch выключен.
- Cron `campaigns-process-every-min` активен и вызывается каждую минуту.
- Но HTTP-вызовы cron к `campaigns` регулярно падают по **5-секундному timeout**.
- В логах `campaigns` нет нормальных строк `[job:campaigns-process] ... processed/sent/failed`, значит worker не доходит до штатного финального логирования.
- Таблица `campaign_dispatch_events` пустая, значит skip-причины типа `sender_paused`, `daily_cap_reached`, `provider_backoff` не логируются - обработка не доходит до отправки/скипа конкретных recipients.

## Что я делал раньше и почему это не помогло

Раньше я решил, что причина - stale lock в `job_locks`:

- вручную очистил `job_locks` для `campaigns-process`;
- сократил TTL lock с 5 минут до 90 секунд;
- проверил, что lock можно снова получить.

Это сняло только симптом, но не первопричину.

Почему ничего не поменялось:

1. `campaigns-process` запускается через database cron с HTTP timeout около **5 секунд**.
2. Сам `processQueue` рассчитан на долгий tick до **55 секунд** и внутри может ждать между отправками, делать много prefetch/count запросов и работать с большим backlog.
3. Поэтому cron-вызов обрывается раньше, чем dispatcher успевает стабильно claim/send/update recipients.
4. Когда вызов обрывается, `finally` может не успеть освободить lock, поэтому следующий tick часто видит `locked`.
5. Сокращение TTL до 90 секунд просто позволяет следующей попытке стартовать быстрее, но каждая новая попытка снова упирается в тот же 5-секундный timeout.
6. Поэтому очередь остается в `scheduled`, без `sent`, без `failed`, без сообщений в inbox.

Иными словами: проблема не в одном зависшем lock, а в архитектуре dispatcher - cron вызывает длинную функцию как короткий HTTP request.

## Цель исправления

Сделать отправку кампаний устойчивой и проверяемой:

- FB Media и fitpreneur должны реально переводить recipients из `scheduled` в `sent` или `failed`.
- Outbound messages должны появляться в нужных conversations/chat.
- Если отправка невозможна, в UI и логах должна быть конкретная причина, а не «ноль отправлено».
- Lock не должен блокировать очередь после timeout.

## План решения

### 1. Сначала добавить нормальную диагностику dispatcher

Добавить в `campaigns` action `process` короткие структурные логи на ключевых этапах, чтобы больше не было «черного ящика»:

- `due_selected` - сколько recipients выбрано;
- `by_workspace` - сколько due по каждому workspace;
- `by_number` - сколько due по каждому номеру;
- `claimed` - сколько переведено `scheduled -> sending`;
- `sent` / `failed`;
- `skipped` с причиной;
- `duration_ms`;
- `lock_acquired` / `lock_released`.

Технически:

- использовать уже существующий `withJobRun`, но обязательно вызывать `run.selected(...)`, `run.processed += 1`, `run.skipped(...)`;
- добавить ранний log сразу после выборки `due`, не только в `finally`.

Зачем: если после фикса отправка снова остановится, будет видно точную причину за 1 минуту.

### 2. Убрать конфликт 55-секундного worker с 5-секундным cron timeout

Переделать `processQueue` в короткие batches, которые гарантированно завершаются за 3-4 секунды.

Новая логика:

- `TICK_BUDGET_MS`: снизить с `55_000` до примерно `3_500` для cron path.
- `perTickLimit`: снизить с `500` до безопасного batch размера, например `25-50`.
- Не делать длинные `setTimeout` внутри cron-worker.
- Если recipient запланирован чуть позже, не ждать внутри функции - оставить его на следующий tick.
- Для paced кампаний отправлять только те recipients, которые уже due now, без ожидания до horizon.

Важно: сейчас код смотрит вперед на 55 секунд и может спать внутри tick. Это нормально для ручного воркера, но плохо для database cron с 5-секундным timeout.

### 3. Разделить два режима обработки

Сделать два budget режима внутри `action=process`:

- **cron mode** - короткий, безопасный, без длинных sleep, batch 25-50;
- **manual/admin drain mode** - длиннее, для ручного запуска из UI или edge test, когда нужно быстро «продавить» накопившийся backlog.

Пример поведения:

- cron каждую минуту стабильно отправляет небольшой batch и всегда возвращает 200 за несколько секунд;
- manual drain можно запускать только админом, с явным лимитом и безопасными cap.

### 4. Исправить lock contract

Текущий lock остается в `job_locks` до `release_job_lock`, но если request timeout/cancelled, release может не произойти.

Изменить lock-подход:

- оставить TTL, но сделать его меньше для `campaigns-process`, например **15-20 секунд**, если cron batch будет коротким;
- при `locked` логировать текущий age lock;
- не считать lock нормальным, если он старше допустимого runtime;
- добавить отдельный cleanup stale locks перед попыткой acquire.

Это не основное исправление, но оно уберет повторение прошлого инцидента.

### 5. Сделать отправку idempotent и безопасную при повторных ticks

Оставить атомарный claim:

```text
scheduled -> sending -> sent/failed
```

Но усилить recovery:

- `sending` старше 2-3 минут возвращать в `scheduled`;
- при повторном запуске не отправлять строку, если у нее уже есть `provider_message_id` или `sent_at`;
- при ошибке отправки обязательно записывать `failed + error_message`, чтобы UI показывал причину.

### 6. Исправить текущий backlog FB Media и fitpreneur

После изменения worker:

1. Разблокировать текущий `campaigns-process` lock.
2. Проверить количество due scheduled:
   - FB Media: 33;
   - fitpreneur: около 1090;
   - плюс другие workspace, где тоже накопились due scheduled.
3. Запустить controlled drain:
   - сначала FB Media маленьким batch, убедиться что появляются `sent` и messages в chat;
   - потом fitpreneur batches по номерам;
   - после каждого batch проверять `sent_count`, `failed_count`, `messages`, `campaign_recipients`.

Не надо вручную массово переводить всё в `sent`. Нужно именно отправить через Gupshup, иначе чат будет показывать фейковую статистику.

### 7. Обновить UI, чтобы это было видно без открытия чата

Добавить/проверить в workspace campaign runtime panel:

- Due now;
- Scheduled backlog;
- Sending stuck;
- Last successful send time;
- Last error;
- Last dispatcher run;
- Кнопка admin-only `Process now / Drain backlog` с лимитом.

Для пользователя это решает вопрос: «как проверять без этого чата?»

Проверка должна быть не только через inbox, а через campaign runtime:

```text
scheduled -> sending -> sent/failed
sent row -> outbound message in conversation
provider_message_id present -> provider accepted send
```

### 8. Финальная валидация

После реализации проверить по данным:

- FB Media:
  - `scheduled` уменьшается;
  - `sent` растет;
  - в `messages` появляются outbound rows;
  - campaign `sent_count` обновляется.

- fitpreneur:
  - новые recipients не остаются вечным `scheduled`;
  - отправка распределяется по номерам;
  - если провайдер отдает ошибки, они видны в `failed/error_message`, а не теряются.

- Cron:
  - `net._http_response` по `campaigns` больше не показывает 5s timeout для process;
  - `campaigns` logs показывают `[job:campaigns-process] status=ok selected=N processed=N ...`;
  - lock освобождается или устаревает быстро.

## Технические изменения

### Backend function `supabase/functions/campaigns/index.ts`

- Уменьшить cron budget.
- Убрать ожидание `setTimeout` в cron path.
- Выбирать due recipients только `scheduled_at <= now()` для cron path.
- Добавить batch limit.
- Добавить detailed logs.
- Добавить clear skip reasons.
- Разделить cron process и manual drain mode.

### Database functions/migrations

- Обновить `try_job_lock` или добавить job-specific TTL для `campaigns-process`.
- При необходимости добавить lightweight table/view для dispatcher health, если текущих logs недостаточно.
- Не менять схему кампаний без необходимости.

### Admin UI

- Добавить понятную панель runtime/debug для кампаний:
  - due;
  - sent;
  - failed;
  - stuck sending;
  - last run;
  - last provider error;
  - admin drain button.

## Почему этот план должен сработать

Потому что он убирает реальную причину: длинный dispatcher сейчас запускается способом, который обрывает его через 5 секунд. После переделки каждый cron tick будет коротким, атомарным и наблюдаемым. Если провайдер принимает сообщения - они начнут появляться в `sent` и в chat. Если провайдер не принимает - мы увидим конкретный `failed/error_message`, а не вечный ноль.
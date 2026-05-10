# План: защита pipeline лидов и WhatsApp от перебоев

Цель — чтобы инциденты "лиды не уходят 2 часа" и "ответы не маршрутизируются в нужный pipeline" больше не повторялись, а если что-то ломается — мы узнавали об этом в течение минут, а не часов.

---

## 1. Cron-расписание и здоровье ingestion

Сейчас всё держится на pg_cron. Нужно сделать так, чтобы остановка одного cron не убивала весь поток.

- **Двойной cron для `google-sheets-sync`**: основной — каждые 2 минуты, страховочный — каждые 10 минут (offset 1 мин). Если основной висит, страховочный подберёт хвост.
- **Двойной cron для `lead-dispatch`**: каждую минуту + страховочный каждые 5 мин.
- **Cron на `health-watchdog`**: каждые 3 минуты (сейчас 5).
- **Cron self-check**: новая функция `cron-heartbeat` пишет в `system_heartbeats(name, last_run_at)` каждый запуск каждого крона. Watchdog алертит, если heartbeat для любой записи старше 2× ожидаемого интервала — это ловит ситуацию "cron вообще выключен/упал на стороне Postgres".

## 2. Расширение health-watchdog

Сейчас он проверяет только sheets sync errors, stale sheets, pending/queued backlog. Добавить:

- **Inbound webhook silence**: если за 30 минут не было ни одного входящего сообщения от Gupshup при наличии активных номеров — алерт (раньше ловили глазами).
- **Outbound send failure rate**: если за последний час доля `lead_imports.status='failed'` > 20% — алерт.
- **Pipeline routing mismatch**: запрос ищет `conversations` с `pipeline_id IS NULL` при том, что у соответствующего `campaign_recipients` есть pipeline — алерт + список conversation_id.
- **Source connection без последнего sync > 15 мин и без ошибки** — отдельный алерт (сейчас падает в общую stale-категорию).
- **Gupshup mail log severity=error за 30 мин** — алерт (мы ловим письма от Gupshup о деградации номера, но сейчас не алертим).
- **Watchdog self-error**: оборачиваем сам watchdog в try/catch и пишем в `system_alerts` если он упал — иначе тишина watchdog'а = тишина алертов.

## 3. Идемпотентные счётчики и backfill

- В `google-sheets-sync` уже есть `last_synced_row` курсор. Добавить **safety re-scan**: каждый 10-й запуск пересматривать последние 50 строк выше курсора, чтобы поймать строки, которые были вставлены ретроспективно (Google Sheets позволяет вставку в середину).
- В `lead-dispatch` добавить **stuck claim recovery**: если лид в статусе `queued` > 10 минут — сбросить в `pending` и логировать.
- Добавить retry с экспоненциальной задержкой в `send-whatsapp` (сейчас одна попытка, при 5xx от Gupshup лид падает в failed).

## 4. Маршрутизация ответов (фикс уже сделан, добавить защиту)

- **Trigger в БД**: при INSERT в `messages` direction='inbound' проверять, что у conversation проставлен `pipeline_id`. Если нет — взять из последнего `campaign_recipients` для этого телефона. Это фоллбек на случай, если webhook-функция снова забудет.
- **Backfill-скрипт**: разовая миграция, которая пройдёт по всем conversations с `pipeline_id IS NULL` и проставит из последнего campaign_recipient (если есть). Чтобы старые битые разговоры не висели в Main.
- **Алерт в watchdog** (см. п.2) на новые случаи.

## 5. Slack-алерты: каналы и приоритеты

- Создать отдельный канал `#alerts-critical` для P0 (sync down, dispatch down, webhook silence) — без debounce 30 мин, debounce только 10 мин.
- Канал `#alerts-info` для warnings (одиночные ошибки строк, низкая deliverability).
- Каждый алерт должен содержать: что сломалось, с какого времени, ссылку на конкретный source/pipeline и **подсказку первого шага** ("проверь edge logs google-sheets-sync"). Сейчас алерты слишком общие.

## 6. Дашборд "System Health" в админке

Страница `/admin/ops` уже есть. Добавить виджет **Pipeline Vitals**:
- Время последнего успешного sheet sync на каждый source (зелёный/жёлтый/красный).
- Время последнего отправленного лида на каждый pipeline.
- Время последнего входящего webhook на каждый whatsapp_number.
- Кол-во лидов в `pending`/`queued` сейчас.
- Последние 10 системных алертов из `system_alerts` с timestamp.

Это даёт глазами увидеть проблему до того, как Slack заспамит.

## 7. Тесты edge-функций

- Deno-тесты для `whatsapp-webhook`: 4 кейса входящего сообщения (известный recipient с pipeline, без pipeline, новый контакт, дубликат) — проверяют, что `conversation.pipeline_id` всегда заполняется правильно.
- Тест для `google-sheets-sync`: пустой sheet, sheet без новых строк, sheet с invalid phone — все помечают source как healthy.
- Тест для `lead-dispatch`: stuck queued recovery.

Запускать через `supabase test_edge_functions` в CI после каждого деплоя.

## 8. Логирование и трассировка

- В каждой функции логировать `correlation_id` (uuid на запрос) во всех console.log — для прохождения через лог-агрегатор.
- В `lead_imports` уже есть `error` поле; добавить `error_at` timestamp чтобы отличать свежие ошибки от старых.

---

## Технические детали

**Новые таблицы:**
- `system_heartbeats(name text PK, last_run_at timestamptz, payload jsonb)` — один upsert на запуск cron.

**Новые edge functions:**
- `cron-heartbeat` — принимает `{name}`, делает upsert в `system_heartbeats`. Дёргается из тела каждого pg_cron job-а до основного вызова.

**Изменения функций:**
- `health-watchdog/index.ts` — новые проверки (см. п.2).
- `google-sheets-sync/index.ts` — safety re-scan каждый N-й запуск.
- `lead-dispatch/index.ts` — stuck queued recovery.
- `send-whatsapp/index.ts` — retry с backoff на 5xx.
- `whatsapp-webhook/index.ts` — defensive pipeline_id resolution (fallback из последнего recipient).

**Миграция:**
- Триггер `messages_inbound_set_pipeline` — на INSERT inbound проставлять `conversations.pipeline_id`.
- Backfill UPDATE для conversations с NULL pipeline_id.
- Таблица `system_heartbeats` + RLS (только service role).

**Cron-расписание (через supabase--insert, не через миграции):**
```text
google-sheets-sync       */2 * * * *   (основной)
google-sheets-sync       2-59/10 * * * * (страховочный)
lead-dispatch            * * * * *
lead-dispatch            */5 * * * *  (страховочный)
health-watchdog          */3 * * * *
```

**Дашборд:**
- `src/pages/admin/OpsLive.tsx` — добавить секцию Pipeline Vitals с realtime подпиской на `system_heartbeats`, `source_connections`, `lead_imports`.

---

## Что НЕ входит в план
- Замена Gupshup или переезд с pg_cron — это отдельный архитектурный разговор.
- Полноценный observability стек (Sentry/Datadog) — пока обходимся Slack + дашбордом.

После твоего ОК начну с п.1-2 (cron + watchdog) — это даёт максимум защиты за минимум времени, потом п.4 (routing trigger), потом остальное.
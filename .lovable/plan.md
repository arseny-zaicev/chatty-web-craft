## Что случилось (короткая диагностика)

Email от Oscar реально пришёл к нам в виде webhook от Gupshup (поэтому ты и клиент видели его в preview/realtime), но **не сохранился в `messages`** и теперь его нигде нет в БД.

Корневая причина в `supabase/functions/whatsapp-webhook/index.ts`:

1. **Сырая payload пишется в `whatsapp_message_events` ТОЛЬКО после** успешного матчинга `whatsapp_number` (строка 184). Если матчинг провалился по причине отличной от `no_match` (например исключение раньше, ambiguous, ошибка БД) — payload теряется.
2. **Любой `throw`** до строки 184 = тишина. Handler ловит всё в `catch` (строка 746) и **возвращает 200**, чтобы Gupshup не ретраил. Никакой записи payload не остаётся.
3. **Realtime фронта** мог показать сообщение из временного in-memory state (preview) ещё до того, как INSERT в `messages` действительно прошёл/откатился.
4. Нет таблицы "сырой архив всего входящего" — есть только `whatsapp_webhook_failures` (узкий case) и `whatsapp_message_events` (после матчинга).

## План: чтобы это больше никогда не повторилось

### 1. Raw-first capture (главное)

Новая таблица `whatsapp_webhook_raw`:
- `id, received_at, type, app_name, destination, source, provider_message_id, payload jsonb, processing_status (received|processed|failed|skipped), processed_at, error_message, retry_count, message_id (nullable FK)`
- Индексы по `received_at`, `provider_message_id`, `processing_status`, `(app_name, source)`.
- RLS: только service role + workspace owners (read-only по своему workspace).

В `whatsapp-webhook/index.ts` **самой первой операцией** после `req.json()` пишем полный payload в `whatsapp_webhook_raw` со статусом `received`. Только после этого вызываем `handleInbound/handleStatus`. В конце апдейтим строку до `processed` (с `message_id`) или `failed` (с `error_message` + stack).

Это гарантирует: **что бы ни упало дальше — у нас всегда есть сырой JSON**.

### 2. Глобальный try/catch вокруг каждого хэндлера

Сейчас исключения внутри `handleInbound` всплывают в верхний `catch`, но `whatsapp_message_events` уже не запишется. Оборачиваем `handleInbound`/`handleStatus` в свой try/catch, который при ошибке апдейтит `whatsapp_webhook_raw` в `failed` с `error_message + stack`, и только потом отдаём 200 Gupshup.

### 3. Снять silent-swallow на этапе INSERT messages

Сейчас если `messages.insert` падает — мы логируем и `return`. Добавляем: 
- запись в `whatsapp_webhook_raw.error_message`,
- запись в `whatsapp_webhook_failures` с reason=`message_insert_failed`,
- **алерт в Slack** (через существующий `slack-dispatch`) на канал ops.

### 4. Replay-кнопка в админке

Страница `/admin` → новая вкладка **Webhook DLQ**:
- Список `whatsapp_webhook_raw` где `processing_status in ('failed','received' старше 5 минут)`.
- Колонки: time (GST), app, destination, type, preview body, status, error.
- Кнопки **Replay** (повторно прогнать через handler) и **View raw JSON**.
- Поиск по номеру / app / тексту в payload.

### 5. Retention + поиск

- `whatsapp_webhook_raw` хранится **90 дней** (cron-задача удаляет старше).
- View `v_whatsapp_inbound_search` объединяет `messages` + `whatsapp_webhook_raw` (где `message_id is null`) чтобы из UI Inbox можно было найти "пришло-но-не-сохранилось".

### 6. Health-watchdog

Расширить существующий `health-watchdog`: если за последние 15 мин в `whatsapp_webhook_raw` есть >0 строк со статусом `failed` или "застрявших" в `received` → Slack alert + помечать workspace в UI красным баннером "⚠ Возможна потеря входящих, проверь Webhook DLQ".

### 7. Realtime честность

На фронте (Inbox) перестать показывать сообщение из realtime preview если потом не приходит подтверждение из `messages` за N секунд — вместо тихого исчезновения показывать toast "Сообщение получено, но не сохранилось — открой Webhook DLQ".

### Технические детали

```text
Request flow ПОСЛЕ фикса:
  Gupshup → webhook
    ├─ 1. INSERT whatsapp_webhook_raw (status=received)   ← НИКОГДА не падает молча
    ├─ 2. try { handleInbound/handleStatus }
    │     └─ INSERT messages → UPDATE raw.status=processed, message_id=...
    ├─ 3. catch → UPDATE raw.status=failed + error + stack
    │            + INSERT whatsapp_webhook_failures
    │            + Slack alert
    └─ 4. return 200
```

Миграции: 1 новая таблица + 1 view + 1 cron retention. Никакого breaking change для существующего кода — `whatsapp_message_events` и `whatsapp_webhook_failures` остаются как были.

### Что это даёт

- 100% входящих payload-ов сохраняются **до** любой бизнес-логики.
- Любая потеря **видна** в UI и алертится в Slack в течение 15 мин.
- Любое потерянное сообщение можно **переиграть одним кликом** из админки.
- Для Oscar конкретно — сообщение уже потеряно (raw таблицы тогда не было), но единственный шанс достать его теперь это Gupshup Provider API (опция #1 из прошлого ответа). Этим планом мы закрываем дыру, чтобы такого больше не было.

Подтверди план — реализую миграцию + правки в edge function + UI вкладку DLQ.

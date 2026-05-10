## Что уже проверено

- Backend сейчас отвечает нормально.
- В ISKRA есть один рабочий pipeline: `Nitish / Ads / India / Delivery`.
- К нему подключены 2 активные Google Sheets source:
  - `Warm Leads | BM | India` - `phone`, `full_name`, cursor на row 3.
  - `Warm Leads | BM | India | Nitish | Bala` - `phone_number`, `namefull_name`, cursor на row 2.
- Оба source реально подключены к одному pipeline, значит должны наследовать одни и те же настройки:
  - Auto first-touch: on
  - Template: `bm_request_confirmation`, approved
  - Sender: `Kartik Chauhan`, ready
  - Daily cap: 200
  - Timezone: `Asia/Kolkata`
  - Pipeline Slack channel: set

## Причины проблемы

1. **Реальный лид уже импортирован, но застрял в `awaiting_manual`.**
   - Лид `Ankur Shrivastava` был импортирован из первой таблицы.
   - Его статус сейчас `awaiting_manual`, поэтому `lead-dispatch` его не подхватывает.
   - Текущий `lead-dispatch` берёт только `pending` лиды.
   - То есть даже если Auto first-touch сейчас включён, старый лид сам не перейдёт в отправку.

2. **Для Google Sheets нет автоматического polling cron.**
   - Cron уже есть для campaign sending, Slack dispatch и lead-dispatch.
   - Но нет cron, который каждые N минут синкает active Google Sheets sources.
   - Поэтому новые строки в Google Sheets не импортируются сами, если не нажать manual sync.

3. **Slack events по импорту сейчас создаются, но Slack dispatcher их пропускает.**
   - В `slack_event_queue` есть события `lead.imported` и `lead.import_failed`.
   - Они обработаны как `skipped`, потому что `slack-dispatch` не умеет эти event types.
   - Поэтому уведомление “лид импортирован / не импортирован / dispatched” не приходит.

4. **Positive reply Slack routing неполный.**
   - `whatsapp-webhook` создаёт `positive_lead` только если automation переводит conversation в positive stage.
   - `slack-dispatch` для `positive_lead` сейчас смотрит workspace Slack channel, а не pipeline Slack channel.
   - Также positive alerts завязаны на `inbox_alerts_enabled`, хотя это отдельная настройка и не должна блокировать interested-lead alerts.

5. **Automations сейчас не scoped к pipeline.**
   - Existing automations target stages из старого/Main pipeline.
   - Новый pipeline имеет свои stages, но automations могут пытаться двигать deal в stage другого pipeline.
   - Это может ломать “interested reply” логику или отправлять alert не туда.

6. **Вторая таблица имеет подозрительный `name_column`.**
   - Сейчас config: `namefull_name`.
   - Если реальный header называется `full_name`, имена из второй таблицы будут приходить пустыми.
   - Phone import это не блокирует, но source выглядит настроенным не идеально.

7. **Window end `00:00` рискованный.**
   - Сейчас pipeline window: `07:00-00:00 Asia/Kolkata`.
   - В scheduling code `00:00` может трактоваться как начало дня, а не конец дня.
   - Это надо нормализовать как “end of day” или явно поддержать overnight window.

## План исправления

### 1. Починить stuck лидов после включения Auto first-touch

- Обновить `lead-dispatch`, чтобы он подхватывал не только `pending`, но и `awaiting_manual` лиды для pipeline, где Auto first-touch включён и checklist валиден.
- При успешной постановке в campaign переводить такие лиды сразу в `queued`, как сейчас разрешено статусными правилами.
- Сделать one-time repair для текущего ISKRA pipeline:
  - найти `awaiting_manual` лидов в `Nitish / Ads / India / Delivery`;
  - перевести их в `pending` или дать `lead-dispatch` забрать их после кодового фикса;
  - проверить, что для Ankur создаётся `campaign_recipient`.

### 2. Добавить auto-sync для всех активных Google Sheets sources

- Добавить backend function `google-sheets-sync-all` или расширить existing `google-sheets-sync` режимом “sync all active sources”.
- Логика:
  - найти все `source_connections` с `kind = google_sheet` и `status = active`;
  - для каждого source вызвать ту же логику, что manual `Sync now`;
  - не ломать cursor `last_synced_row`;
  - возвращать результат по каждому source: `accepted`, `rejected`, `last_synced_row`, `error`.
- Добавить cron каждые 1-2 минуты.
- Ограничить batch size, чтобы несколько таблиц не упирались в timeout.

### 3. Убедиться, что обе таблицы одинаково реагируют на pipeline settings

- Оставить source-level config только для spreadsheet/table mapping:
  - spreadsheet id
  - tab name
  - phone column
  - name column
  - header row
  - cursor
- Все delivery settings брать только из pipeline:
  - auto first-touch
  - template
  - sender numbers
  - sending window/timezone
  - daily cap
  - Slack channel
- Добавить в source UI явный текст/status: “inherits pipeline outreach settings”.
- Добавить проверку в sync response/debug UI, какой pipeline config был применён при импорте.

### 4. Починить Slack lead events

- В `slack-dispatch` добавить обработку:
  - `lead.imported`
  - `lead.import_failed`
  - `lead.dispatched`
  - `lead.dispatch_blocked`
- Routing:
  - сначала `payload.slack_channel_id` из pipeline;
  - fallback на workspace Slack channel;
  - ops channel только если событие реально важно для ops.
- Чтобы события больше не уходили в `skipped`, а становились `sent` или `failed` с понятной ошибкой.

### 5. Починить Slack alert для interested/positive replies

- В `whatsapp-webhook` при inbound reply определять pipeline conversation/deal.
- В `positive_lead` payload добавлять:
  - `pipeline_id`
  - `pipeline_name`
  - `slack_channel_id` pipeline
  - `stage_name`
  - `conversation_id`
  - phone/name/message
- В `slack-dispatch` для `positive_lead` отправлять именно в pipeline Slack channel.
- Не блокировать positive alerts настройкой `inbox_alerts_enabled`; эта настройка должна относиться к unread spike, не к interested leads.
- Оставить 24h dedupe на conversation, чтобы не спамить на каждый follow-up reply.

### 6. Сделать automations pipeline-safe

- В webhook, перед движением deal, если automation target stage принадлежит другому pipeline:
  - взять имя/stage_type target stage;
  - найти stage с таким же именем в текущем conversation pipeline;
  - двигать deal туда.
- Если matching stage не найден:
  - не двигать в чужой pipeline;
  - записать диагностическое событие/log;
  - Slack alert не слать как positive, если stage не подтверждён.
- Позже можно добавить `pipeline_id` в `stage_automations`, но для быстрого фикса достаточно runtime remap.

### 7. Нормализовать sending window `00:00`

- В scheduling helper считать `00:00` как `24:00`, если start раньше end-of-day.
- Если end <= start, явно поддержать overnight window или показать warning в UI.
- В UI подписать: “Timezone used for sending: Asia/Kolkata”, чтобы было понятно, что это не browser/local time.

### 8. Улучшить диагностику в Settings

- В counters добавить:
  - `Awaiting manual`
  - `Invalid`
  - `Duplicate`
- В source card добавить last sync summary:
  - imported
  - skipped invalid
  - skipped duplicate
  - last row synced
  - last error
- Для Google Sheets добавить “Sync all sources now”, чтобы сразу проверить обе таблицы одним кликом.

### 9. Починить текущие данные

- Для текущего stuck real lead:
  - после code fix запустить `lead-dispatch` вручную;
  - убедиться, что статус стал `queued` и появился `campaign_recipient`.
- Для второй таблицы:
  - проверить actual headers;
  - если header реально `full_name`, заменить `name_column` с `namefull_name` на `full_name`.
- Не трогать invalid Meta test leads - они должны оставаться `invalid`.

## Проверка после фикса

1. Database checks:
   - 2 active Google Sheet sources подключены к одному pipeline.
   - новые строки из обеих таблиц импортируются в один pipeline.
   - auto-on импорт создаёт `pending`, затем `queued`.
   - old `awaiting_manual` больше не stuck.

2. Function checks:
   - `google-sheets-sync-all` возвращает результат по двум source.
   - `lead-dispatch` создаёт first-touch campaign/recipients.
   - `campaigns` отправляет scheduled recipients.
   - `slack-dispatch` переводит lead events в `sent`, не `skipped`.

3. Slack checks:
   - import success/failure приходит в правильный pipeline Slack channel.
   - dispatch blocked приходит с причиной, если checklist сломан.
   - interested/positive reply приходит в Slack один раз на conversation в 24h.

## Риски

- Если автоматически подхватить все old `awaiting_manual`, можно случайно отправить старым лидам. Поэтому one-time repair надо ограничить текущим ISKRA pipeline и текущими свежими лидами.
- Если Google Sheet содержит тестовые Meta rows, они продолжат попадать в `invalid` - это правильно.
- Если Slack channel ID неверный или bot не добавлен в channel, event станет `failed`, но уже с видимой ошибкой, а не silent `skipped`.
- Если second sheet header действительно не `full_name`, `name_column` нужно подтвердить вручную.
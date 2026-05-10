# План: запуск первой кампании на Nitish Ads India

Цель: за один проход подключить Google Sheet к нужному пайплайну, запустить авто-отправку первого касания, выдать доступ delivery-пользователю с правильной атрибуцией ответов и нотификациями, и починить мелкий баг в фильтре пайплайна.

---

## 1. Фикс блокера дispatch (обязательно перед запуском)

В `lead-intake/index.ts` остался stub, который после приёма лида переводит его в `awaiting_manual` даже если на пайплайне `auto_outreach_enabled = true`. `lead-dispatch` забирает только `pending`, поэтому без этого фикса ни один лид из Google Sheet не уйдёт автоматически.

**Действие:** убрать блок «flip to awaiting_manual when auto_outreach_enabled». Если `auto_outreach_enabled = true` — оставляем `pending` (заберёт dispatcher); если `false` — оставляем `awaiting_manual` для ручной отправки.

---

## 2. Подключение Google Sheet к Nitish Ads India

Текущий `source_connections` уже поддерживает webhook intake. Для Sheet нужен pull-сценарий.

**Действие:**
- В `PipelineConfigSheet` добавить тип источника **Google Sheet** с полями: spreadsheet URL, worksheet name, mapping колонок (`phone`, `name`, опц. `variables`), «start row» и режим (`one-shot import` / `poll every N min`).
- Создать edge function `google-sheets-poll` (cron каждые 5 мин), которая:
  1. Берёт активные `source_connections` типа `google_sheet`.
  2. Через существующий connector `google_sheets` читает диапазон с `last_synced_row + 1`.
  3. Дедуп по `phone` внутри `lead_imports` пайплайна (как webhook сейчас).
  4. Создаёт `import_batch` + строки в `lead_imports` со статусом `pending`.
  5. Пишет `last_synced_row` и счётчики в `import_batches`.
- Для MVP допустим **only manual «Sync now»** + cron, без OAuth-per-user (используем dev-connection, как описано в guide).

**Контроль запуска (UI «Source status» внутри `PipelineConfigSheet`):**
- последняя синхронизация, число `pending / queued / sent / replied / failed`,
- кнопка `Sync now`,
- ссылка на лог последних 10 `import_batches` с количествами и ошибками,
- бейдж блокировок из `slack_event_queue` (`no_template`, `no_sender`, `daily_cap_reached`...).

---

## 3. Подготовка пайплайна Nitish Ads India к авто-выдаче

Чек-лист, который должен закрыться до старта (UI пометит зелёными галочками в `PipelineConfigSheet`):
- approved `first_touch_template_id`;
- ≥1 active `whatsapp_number` в `default_sender_number_ids`;
- `sending_window` (start/end + timezone Дубая);
- `daily_cap` (например 80);
- `slack_channel_id` для нотификаций;
- `auto_outreach_enabled = true`.

Без всех галочек переключатель «Enable auto-outreach» дизейблим (сейчас включается без проверок).

---

## 4. Доступ delivery-пользователю (Nitish)

Используем уже существующие invite-link с pipeline scope.

**Действие:**
- В `TeamView` для воркспейса iskra сгенерировать invite со scope **только** Nitish Ads India и ролью `member`.
- Прислать ссылку Nitish, он регистрируется → попадает только в этот пайплайн (Inbox/Pipeline уже фильтруются по pipeline_scope).
- Проверка: под его аккаунтом не видно других досок и чужих чатов.

---

## 5. Атрибуция ответов (кто кому написал)

`messages` уже хранит `direction` и `sender_user_id` для исходящих от оператора. Нужно гарантировать:
- При ответе из Inbox `sender_user_id = auth.uid()` (проверить, что это пишется во всех путях: composer, quick replies, AI suggest).
- В UI чата выводить плашку отправителя для исходящих: аватар + имя (`memberDisplayName`), у входящих — имя контакта.
- Mobile/Desktop одинаково.

---

## 6. Статистика по операторам

Добавить вкладку **Team activity** в `WorkspaceOverview` (или `TeamView`), per-pipeline scope:
- среднее время первого ответа (по `messages.outbound_at - inbound_at` в рамках conversation),
- кол-во ответов за день/неделю,
- last seen / online (берём из существующего `useHeartbeat` → таблица `user_presence`; если её нет, добавить лёгкую таблицу с upsert каждые 30 c).

MVP: только «avg first response», «replies today», «last active». Графики позже.

---

## 7. Нотификации в Slack для Nitish

Два уровня (оба уже частично есть в `slack-dispatch`):
- **Pipeline channel** (`pipelines.slack_channel_id`) — общие события: `lead.dispatched`, `lead.dispatch_blocked`, `conversation.first_reply`, `deal.stage_changed`.
- **Personal DM / private channel оператора** — события, где `assignee_user_id = его user_id`: новый ответ в его чате, назначение на него.

**Действие:**
- Добавить в `workspace_members` (или новой `member_notification_prefs`) поля `slack_user_id` и `dm_enabled`.
- В `slack-dispatch` для `conversation.inbound_message` проверять assignee → если есть `slack_user_id`, слать DM, иначе fallback в pipeline-канал.
- В UI `TeamView` форма «Slack handle» для каждого члена.

Для Nitish: либо создать канал `#delivery-nitish` и положить его в `pipelines.slack_channel_id` для Nitish Ads India, либо привязать его Slack user → DM. Рекомендую **канал `#delivery-nitish`** — проще шарить контекст с админом.

---

## 8. Баг: фильтр в pipeline показывает «User 18b05c»

В `src/pages/Pipeline.tsx:415` используется инлайн-фолбэк `User ${user_id.slice(0,6)}`, минуя `memberDisplayName`. У Nitish скорее всего нет `full_name`, но есть `email` — нужно показать локальную часть email-а.

**Действие:** заменить инлайн на `memberDisplayName(m)` (как уже сделано в `AssigneeSelect`). Дополнительно: при первом приёме invite ставить `full_name` из формы регистрации, если оно введено.

---

## MVP scope

**P0 — нужно сегодня для запуска Nitish:**
1. Фикс stub в `lead-intake` (раздел 1).
2. Фикс «User …» в фильтре (раздел 8).
3. Чек-лист готовности пайплайна с дизейблом тоггла (раздел 3).
4. Подключение Google Sheet: UI + edge function + `Sync now` + статус-панель (раздел 2).
5. Invite-ссылка для Nitish со scope только этого пайплайна (раздел 4).
6. Pipeline Slack channel для нотификаций dispatch / first reply (раздел 7, только канал, без DM).

**P1 — следом, не блокирует запуск:**
- Cron-поллинг Google Sheet (P0 = ручная синхронизация).
- DM-нотификации по `slack_user_id`.
- Team activity вкладка со статистикой ответов.
- Plate с именем отправителя в UI чата (если ещё не везде).

**P2:**
- Несколько источников (CSV upload, Pipedrive sync) per pipeline.
- Per-source override темплейта/окна.
- Auto-rotate sender numbers с per-number daily cap.

---

## Технические детали

- **DB:** `source_connections` расширить полями `kind='google_sheet'`, `spreadsheet_id`, `worksheet`, `column_map jsonb`, `last_synced_row int`, `poll_interval_minutes`. Миграция + RLS как у текущих source_connections.
- **Connector:** `google_sheets` уже сконфигурирован в проекте, запросы через `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/{id}/values/{range}`. Не двойного-encode-ить range.
- **Cron:** новый job `google-sheets-poll-every-5-min` в `supabase/config.toml`.
- **Slack DM:** `chat.postMessage` с `channel = slack_user_id` (требует scope `chat:write` на user-токене либо `im:write` для бота).
- **Presence:** если `user_presence` отсутствует — таблица `(user_id pk, last_seen_at, workspace_id)` + RLS «members of workspace can read».

## Edge cases / риски

- Google Sheet OAuth: connector привязан к dev-аккаунту. Если клиент захочет свой Sheet — нужен share на тот сервисный аккаунт или per-user OAuth (P2).
- Daily cap считается в UTC, окно — в таймзоне пайплайна (известный баг). Для Дубая (UTC+4) расхождение проявится только если запуск идёт после 20:00 локального; для первого запуска не критично, но в P1 поправить на TZ-aware.
- При большом Sheet (>500 строк) сначала бить на батчи по 200 чтобы не упереться в лимиты dispatcher.
- Если Nitish зарегистрируется без full_name — фолбэк на email (фикс №8) это покрывает.
- Дубликаты по phone дедупятся внутри пайплайна, между пайплайнами — нет (это by design).

## Что остаётся ручным

- Создать Slack-канал `#delivery-nitish` и положить его id в config пайплайна.
- Заполнить approved-template, sender numbers, окно и cap для Nitish Ads India.
- Шарить Google Sheet на сервисный gmail коннектора.

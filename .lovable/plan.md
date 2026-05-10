# План: Slack-уведомления в канал Nitish + проверка трекинга ответов

## Что нашёл

### 1. Positive lead уходит в Iskra main, а не в Nitish-канал
- Pipeline `Nitish / Ads / India / Delivery` имеет свой Slack-канал: `C0B2DBG8D0X` ✓
- Но **DB-триггер `enqueue_positive_lead_event`** (срабатывает когда менеджер ставит звезду) кладёт в `slack_event_queue.payload` только `conversation_id`/`contact_phone`/`contact_name`/`last_message_text` — **БЕЗ** `pipeline_id` и `slack_channel_id`.
- В `slack-dispatch` логика: `pipelineChannel = payload.slack_channel_id || workspaceChannel`. Раз нет первого → летит в `workspaces.slack_channel_id` (общий канал Iskra).
- Аналогичный путь из `whatsapp-webhook` (авто-positive по стейджу) уже резолвит pipelineSlack правильно. Расхождение между двумя источниками.

### 2. Трекинг ответов менеджера — уже работает
- `messages.sent_by_user_id` пишется в `send-whatsapp` (строки 267, 284).
- `conversations.active_responder_id/at` обновляется через `touchResponder` при открытии чата и отправке.
- В UI Inbox под исходящим сообщением уже видно «· by [Имя]» (CRM.tsx:881-883).
- Nitish есть в workspace `iskra` как `manager` (user_id 755912a7…). Значит, когда он отвечает в Inbox — сообщение пишется с его user_id и в БД, и видно в чате.

## Что делаем

### A. Чиним маршрутизацию `positive_lead` (миграция)
Перепишу функцию `public.enqueue_positive_lead_event()`:
- Резолвлю `pipeline_id` и `slack_channel_id` через JOIN на `pipelines` по `NEW.pipeline_id`.
- Кладу их в `payload` рядом с `pipeline_name`.
- Триггер остаётся тот же (`AFTER UPDATE OF is_starred`).

После фикса: звезда на чате внутри Nitish-пайплайна → событие летит в `C0B2DBG8D0X`, не в основной Iskra-канал.

### B. Проверка после деплоя
1. Открыть чат Priyanshu (или любой в Nitish), нажать звезду → убедиться что в `slack_event_queue` появилось событие с `slack_channel_id=C0B2DBG8D0X` и `status=sent`.
2. Снять звезду / поставить заново на другом чате — убедиться что `last_positive_lead_alert_at` дедупит в пределах 24ч (это уже работает в webhook-пути; для is_starred-триггера дедупа сейчас нет — добавлю простую дедуп-проверку «не чаще 1 раза в 24ч на conversation»).
3. Ответить от имени Nitish в Inbox → подтвердить что в `messages.sent_by_user_id = 755912a7…` и в чате видно «by Nitish Sehrawat».

### C. Что НЕ трогаю
- Workspace-уровень канала Iskra оставляем как fallback для пайплайнов без `slack_channel_id`.
- Логику `whatsapp-webhook` (auto-positive по стейджу) — она уже корректна.
- Авторизация / права Nitish — он уже manager в workspace, ничего менять не нужно.

## Файлы
- Новая миграция: переопределение `public.enqueue_positive_lead_event()` с резолвом pipeline-канала и 24ч-дедупом.

## Чего НЕ будет
- Никаких новых уведомлений-типов — только маршрутизация существующего `positive_lead`.
- Изменений в UI Inbox — трекинг отправителя уже есть.

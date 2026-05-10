## Что я нашёл

- **Auto first-touch не включается**, потому что чеклист считает валидными только номера со статусом `active`.
- У тебя в ISKRA сейчас есть номер **Kartik Chauhan** со статусом `stock`, хотя он уже assigned к ISKRA, с API key, webhook и 1 approved template. Из-за этого UI показывает его выбранным, но чеклист пишет `At least one active sender number`.
- **Sadya** в ISKRA со статусом `ready`, но текущий чеклист тоже не считает `ready` валидным.
- В Fleet Registry логика показывает `stock` как “свободный/складской”, но Pipeline Config использует `status === active` как единственный разрешённый sender - отсюда конфликт.
- **Timezone сейчас по факту UTC**, потому что UI сохраняет только `start/end`, без `timezone`. Значит `07:00 - 00:00` не “Индия” и не “твое локальное время” явно - это сейчас неочевидная/опасная настройка.
- **Slack для positive replies уже частично есть**, но он срабатывает только когда conversation вручную starred (`is_starred = true`). Автоматизация “Positive reply -> stage” сейчас не создаёт Slack event сама по себе.
- Синк шаблонов уже есть через `campaigns` function (`sync_templates_all`), но в Pipeline Config нет кнопки “Refresh templates”, поэтому непонятно, актуальный список или нет.

## План правок

### 1. Починить выбор sender numbers для Auto first-touch

- Считать отправочными номерами не только `active`, но и **`ready`**.
- Для номера, который assigned к workspace, имеет API key, webhook и approved templates, показывать понятный статус “ready to send” даже если raw status ещё `stock`.
- В чеклисте заменить формулировку на более честную: **“At least one ready sender number”**.
- В `lead-dispatch` тоже разрешить `ready`, иначе UI даст включить, а backend потом всё равно заблокирует.

### 2. Убрать путаницу `stock` vs assigned client

- В Pipeline Config рядом с каждым sender number показывать причину, почему он не проходит: `stock`, `no API key`, `no webhook`, `no approved templates`, `disabled`.
- Для Fleet/Workspace сделать правило: если номер assigned клиенту и готов технически, он должен проходить как sender даже если старый статус остался `stock`.
- Отдельно можно миграцией привести текущий Kartik Chauhan из `stock` в `ready`, чтобы у тебя сразу включилось без ручной правки.

### 3. Сделать timezone явной

- Добавить в Pipeline Config поле **Timezone** рядом с Window start/end.
- Default для новой настройки поставить **Asia/Kolkata** для India pipeline.
- Сохранять `sending_window: { start, end, timezone }`.
- Показать под полями короткую строку типа: `Sends between 07:00-00:00 Asia/Kolkata`.
- Backend `lead-dispatch` уже умеет читать `sending_window.timezone`, нужно только начать сохранять это из UI.

### 4. Добавить refresh templates прямо в Pipeline Config

- В блоке First-touch template добавить кнопку **Refresh templates**.
- Она вызовет существующий sync по всем номерам workspace.
- После успеха обновит список templates и numbers readiness.
- В sender chips показать `templates: X approved` и `last synced` где доступно.

### 5. Slack notification на заинтересованный ответ

- Добавить автоматический Slack event, когда automation переводит deal/conversation в positive stage.
- Логика: если inbound reply совпал с rule и target stage называется вроде `Positive reply` / positive-type stage, создать событие `positive_lead` в Slack queue.
- Сообщение должно идти в pipeline/workspace Slack channel, который ты указал в Pipeline Config.
- Чтобы не спамить, добавить dedupe: не отправлять повторный positive alert по одной conversation чаще одного раза.

### 6. Улучшить UX включения Auto first-touch

- Сейчас switch просто говорит “Complete checklist below first”. Сделать toast конкретным: например `Kartik Chauhan is selected but status is stock. Mark as Ready or refresh Fleet status.`
- Кнопку Save оставить рабочей даже если Auto выключен, но при включении показывать точные blockers.
- После Save инвалидировать pipeline + numbers queries, чтобы статус не казался старым.

## Технические файлы

- `src/components/workspace/PipelineConfigSheet.tsx` - readiness, sender chips, timezone, refresh templates, понятные ошибки.
- `supabase/functions/lead-dispatch/index.ts` - разрешить sender statuses `active` + `ready`, использовать timezone.
- `supabase/functions/whatsapp-webhook/index.ts` - при matched positive automation ставить positive Slack event.
- Migration - если нужно: dedupe поле/trigger для positive alerts и/или привести текущий Kartik Chauhan `stock -> ready`.

## Ожидаемый результат

После этого ты сможешь:

1. выбрать Kartik/Sadya как sender numbers,
2. включить **Auto first-touch**,
3. явно видеть, по какому timezone шлётся pipeline,
4. обновлять templates прямо из pipeline settings,
5. получать Slack alert, когда человек реально дал заинтересованный ответ, а не только когда ты вручную starred conversation.
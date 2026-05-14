## Что делаем

В существующий диалог **"{Preset} - create batch"** (`WorkspaceData.tsx`, секция Ingestion presets) добавляем режим **"Multi-batch"**: вместо одного батча создаём сразу N штук, на каждый - свой Codex-промпт с уже впечатанным `batch_id`. UI и поля - как сейчас, просто появляется список аудиторий и переключатель сверху.

## UI изменения (только в этом диалоге)

Сверху, под `DialogDescription`:

- Toggle: `Create multiple batches` (off by default = текущее поведение, ничего не ломаем)
- Если on:
  - Один общий блок: `Country (optional)`, `Campaign type`, `Template variant`, `Notes`, `Variables (same-for-everyone)` - всё как сейчас, эти значения шарятся между всеми батчами
  - Убираем поле `Audience` и `Batch name` из общего блока
  - Появляется список **"Audiences"**:
    - Textarea `Paste audiences (one per line)` - быстрый ввод, или
    - Список редактируемых строк: `Audience name` (каждая строка → отдельный батч)
    - Кнопки `+ Add row`, `Remove` на строке
    - Превью имени батча справа от каждой строки: `2026-05-14 | UK | {audience}` (та же `buildBatchName` что и сейчас)
  - Лейбл submit-кнопки: `Create N batches`

## Поведение submit (multi-batch)

В `submitBatch`:

- Валидация: ≥1 непустая аудитория, все `staticValues` валидны (как сейчас), батч-нэймы уникальны (trim+lower)
- Цикл по аудиториям → для каждой делаем тот же самый `insert` в `audience_batches` что и сейчас, с одинаковыми: `country`, `campaign_type`, `copy_profile`, `notes` (со staticHeader), `variable_schema`. Различаются только `name` и `audience`-часть имени.
- Не атомарно: если одна вставка упала - остальные продолжаем, в конце показываем сводку (создано X из N, ошибки списком)
- В state кладём `createdBatches: Array<{ id, name, audience }>` вместо одного `createdBatchId`

## Step 2 экран после создания (multi-batch)

Вместо одного промпта - аккордеон/список карточек по созданным батчам. На каждой:

- `{audience}` + `batch_id` (короткий моно)
- Кнопка `Copy prompt` - копирует `buildPresetPrompt(creating, { workspaceName, workspaceId, batchId, staticValues })` для этого батча
- Кнопка `Pull from my Supabase` - тот же edge-вызов `import-audience-from-personal` с этим `batch_id` (точно как сейчас)
- Сверху одна доп.кнопка `Copy all prompts` - склеивает все промпты с разделителем `--- BATCH: {name} ---`, чтобы можно было скормить Codex одним заходом

Single-batch путь (toggle off) - оставляем 1:1 как сейчас, ни логику, ни UI не трогаем.

## Что НЕ трогаем

- `audienceData.ts`, edge `import-audience-from-personal`, схему БД, `buildPresetPrompt`, `buildBatchName` - без изменений
- Smart Upload, Launch Wizard, Campaigns, Reports - не трогаем
- Pull-логика та же (per-batch), просто вызывается из карточки нужного батча

## Acceptance

1. Открываю `Marketing Basic - create batch`, включаю `Create multiple batches`.
2. Вставляю 6 аудиторий: `UK Financial`, `UK Consulting`, `UK Marketing`, `UK Staffing`, `UK Coaching`, `UK Mixed`. Country = `UK`. Заполняю variables один раз.
3. Жму `Create 6 batches` → в Data появляются 6 батчей `2026-05-14 | UK | UK Financial`, ..., `2026-05-14 | UK | UK Mixed`.
4. Step 2: вижу 6 карточек с `batch_id` и `Copy prompt` на каждой + `Copy all prompts` сверху.
5. Codex отрабатывает по каждому промпту → жму `Pull from my Supabase` на нужной карточке → 209/119/... строк импортируются ровно в свой батч.
6. Toggle off → диалог работает абсолютно как сейчас.

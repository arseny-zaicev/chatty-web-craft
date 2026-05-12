## Контекст

Файл `May_2026_Miltos_George_Data_1.xlsx` для клиента **GO** содержит 3 листа:
- `Greece Valid` — Medspa, ~1000 номеров, формат `30…`
- `Malta Valid` — Real Estate, ~1000 номеров, формат `356…`
- `Numbers Only` — сводка

Хорошая новость: модель данных это уже поддерживает.
- `audience_batches` имеет поле `country` и `campaign_type`
- `audience_rows` хранит `phone` + `payload` (jsonb) — туда влезут `business_name`, `city`, `category`, `website`, `segment`
- `LaunchWizard` уже группирует WhatsApp-номера в пулы по стране (`groupNumbersByCountry`) и даёт выбрать `poolCountry`

То есть отдельная "страновая" таблица не нужна. Достаточно правильно загрузить базу и пометить страну.

## Идея (рекомендую)

**Two batches, one workspace.** Создаём workspace `GO` (если ещё нет) и заливаем как **две отдельные audience-batch**:

1. `2026-05 · GO · Greece · Medspa` → `country = "GR"`, `campaign_type = marketing`, 1000 строк (только листы Greece Valid)
2. `2026-05 · GO · Malta · Real Estate` → `country = "MT"`, `campaign_type = marketing`, 1000 строк (только Malta Valid)

В Launch Wizard оператор выбирает:
- **Batch** (Greece или Malta) — это сам список получателей
- **Sender pool** (страна номеров: GR или MT) — фильтрует WhatsApp-номера workspace по префиксу

Так Греция всегда уйдёт с греческих номеров, Мальта — с мальтийских, без шанса перепутать.

### Почему не один batch с фильтром по `country`
- Лишняя UI-работа (новый фильтр в LaunchWizard, сплит расхода аудиторий, отчётность)
- Сегмент и copy у Греции (Medspa) и Мальты (Real Estate) разные → шаблоны и copy_profile должны быть разные → это и так логически 2 кампании
- Раздельные batch'и дают раздельные счётчики `usage_status` ("сколько Греции уже отправили")

## Что я сделаю

1. **Подготовка данных (скрипт, не код в проекте)**
   - Прочитать xlsx, отфильтровать только валидные строки (`normalized_phone` не пустой, длина >= 8)
   - Нормализовать телефон (только цифры, без `+`)
   - Сложить в `payload` jsonb: `{ business_name, city, category, subcategory, segment, website_or_domain, address, last_online, gender, age }`
   - Дедуп по `phone` внутри каждой страны

2. **Загрузка в БД через `supabase--insert`**
   - Найти/создать workspace `GO` (если уже есть — использовать его id; уточню у вас)
   - Вставить 2 строки в `audience_batches`:
     - country `GR`, campaign_type `marketing`, copy_profile `Medspa`, variable_schema выведенная из payload (business_name, city, category…)
     - country `MT`, campaign_type `marketing`, copy_profile `Real Estate`
   - Bulk insert в `audience_rows` (по 500 за раз) с `validation_status = valid`, `usage_status = unused`

3. **Проверка в UI**
   - Открыть `/ws/go/data` — увидите 2 batch'а с бейджами `GR` / `MT`
   - В Launch Wizard выбираете нужный batch + соответствующий пул номеров

## Что нужно от вас (1 минута, перед запуском)

1. Workspace **GO** уже создан? Если да — какой `slug` (`/ws/<slug>`)? Если нет — создать с `slug = go`?
2. У `GO` уже залиты WhatsApp-номера для **Греции** и **Мальты** в `whatsapp_numbers`? Без них Launch Wizard не покажет пулы (но базу можно залить заранее).
3. Есть утверждённые шаблоны (`message_templates`) под Medspa/Real Estate, или это пока только аудитория?

Как только подтвердите — я делаю миграцию данных и кидаю 2 готовых batch'а в `/ws/go/data`.

## Технические детали

- Источник: `/tmp/data.xlsx` (уже скопирован из user-uploads)
- Скрипт парсинга: python + openpyxl, итерация по `Greece Valid` и `Malta Valid`, сборка SQL `INSERT … VALUES (…), (…), …` батчами
- Ничего в схеме менять не надо — `country` text, `payload` jsonb уже есть
- RLS: `audience_batches` требует `is_workspace_manager(workspace_id, auth.uid())` на insert → буду вставлять через `supabase--insert` (service role, обходит RLS), `user_id` поставлю на владельца workspace
- Безопасность исторических данных payouts/finance не задета — только новый контент в audience_*

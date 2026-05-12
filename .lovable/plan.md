## Цель

Сделать заливку аудиторий быстрее через AI-ассистента в разделе **Data**, не теряя контроль. Два входа в одном экране: классическая форма (как сейчас) + AI-чат для быстрых заливок. Любой результат — всегда **draft** с preview-таблицей, заливка в `audience_batches/audience_rows` только после Confirm.

## Ключевая идея

Каждый workspace уже имеет **prep_profiles** (есть таблица, см. `src/lib/prepProfiles.ts`). Расширим их: prep_profile становится «AI-промптом» для нормализации данных. Внутри профиля:

- какой шаблон (template) ожидается
- какие переменные нужны и в каком формате (например `first_name` — capitalize, `city` — выбрать из списка)
- какие колонки источника как мапятся (синонимы, fallback)
- какие строки отбрасывать (без телефона, без имени, дубли, "test" и т.п.)
- статические значения переменных (валюта, страна и т.п.)

Тогда AI получает: `prep_profile + любой файл/текст` и возвращает структурированный JSON, готовый к Confirm.

## UX

В `WorkspaceData.tsx` добавляем переключатель сверху:

```text
[ Smart upload (AI) ]   [ Manual form ]
```

### Smart upload tab

```text
┌─────────────────────────────────────────────────┐
│ 1. Pick prep profile:  [ goflow_intro_v2  ▾ ]   │
│    (или Create new)                              │
│                                                  │
│ 2. Drop file(s) or paste here:                   │
│    ┌─────────────────────────────────────────┐  │
│    │ [drag CSV/XLSX/TXT]   or paste rows...  │  │
│    └─────────────────────────────────────────┘  │
│                                                  │
│ 3. (опц.) Дополнительно в чате:                  │
│    "только AE, без дублей с прошлой недели"      │
│                                                  │
│ [ Analyze with AI ]                              │
└─────────────────────────────────────────────────┘
```

После Analyze AI возвращает summary + preview:

```text
✓ Found 1,247 rows
✓ Detected columns: phone, имя, город → mapped to phone, first_name, city
✓ Country: AE (98%), other (2%)
✗ Dropped 43 rows (invalid phone), 12 dupes
⚠ 5 rows missing first_name → fallback "Hello"

Template match: utility_account_v3 (98% confidence)

[ Preview table — 1,247 valid rows ]
[ Edit mapping ]   [ Confirm & Save as Audience ]
```

Всё сохраняется в `audience_batches` (как `is_launch_ready=false` draft) только после Confirm.

### Chat-style режим (внутри Smart upload)

Чат остаётся в той же панели — туда можно дополнительно "докинуть" файл или написать "добавь ещё этот список, той же логикой". AI помнит prep_profile и preview, обновляет draft до Confirm.

## Что AI делает (и не делает)

**Делает (через Lovable AI Gateway, `google/gemini-3-flash-preview`):**
- Маппинг колонок файла → переменные шаблона (по prep_profile)
- Определение страны/гео по номерам
- Match копии сообщения с `message_templates` (fuzzy по body)
- Предложение audience name
- Объяснение что выкинул и почему

**Не делает:**
- Парсинг CSV/XLSX (локально, как сейчас в `audienceData.ts` — токены не тратим)
- Валидацию номеров (локально, regex)
- Дедуп (локально, по `audience_rows`)
- Создание новых templates (только match существующих)
- Запись в БД до Confirm

## Архитектура

### Новый edge function: `audience-ai-prepare`

Input:
```json
{
  "workspace_id": "...",
  "prep_profile_id": "...",
  "parsed_rows": [{ "phone": "...", "имя": "...", ... }],  // первые 200 для AI
  "all_headers": ["phone", "имя", "city"],
  "user_hint": "только AE",
  "pasted_copy": "Hi {{1}}, your account..."
}
```

Output:
```json
{
  "column_mapping": { "phone": "phone", "first_name": "имя", "city": "city" },
  "static_values": { "currency": "AED" },
  "matched_template_id": "uuid",
  "matched_template_confidence": 0.98,
  "drop_rules": ["invalid_phone", "missing_name_fallback"],
  "country_distribution": { "AE": 1222, "other": 25 },
  "suggested_name": "AE | goflow intro | 12 May",
  "warnings": ["5 rows missing first_name"]
}
```

Frontend применяет mapping локально ко всем строкам (не только 200) и показывает preview. Confirm = существующий `createAudienceBatch` flow.

### Расширение `prep_profiles`

Добавить колонки:
- `ai_instructions text` — промпт для AI ("этот профиль для marketing rebookings, переменные city и offer обязательны")
- `template_id uuid` — дефолтный шаблон
- `column_synonyms jsonb` — `{ "first_name": ["имя", "name", "fname"] }`

Миграция простая, без breaking change.

### Файлы

**Новые:**
- `supabase/functions/audience-ai-prepare/index.ts` — AI вызов
- `src/components/workspace/AudienceAIUpload.tsx` — UI tab
- `src/lib/audienceAI.ts` — клиент к edge function + apply mapping локально

**Изменения:**
- `src/pages/workspace/WorkspaceData.tsx` — добавить таб Smart upload / Manual
- `src/lib/prepProfiles.ts` — поля `ai_instructions`, `template_id`, `column_synonyms`
- migration: ALTER `prep_profiles`

## Стоимость / производительность

Файл парсится локально → AI получает только sample (первые 200 строк) + headers + копию + prep_profile. На 10k-строчный файл уходит ~3k токенов = центы. Latency 2-4 сек.

## Риски

1. **AI ошибается в маппинге** — митигируем preview-таблицей и кнопкой "Edit mapping" перед Confirm.
2. **prep_profile становится "магией"** — нужен хороший UX для редактирования профиля (показать что AI инструкции делают). Это отдельная итерация.
3. **Шаблон не найден** — в первой версии просто warning "no template match, pick manually" + dropdown.

## Скоуп v1 (что строим сейчас)

1. Migration: расширить `prep_profiles` (3 поля)
2. Edge function `audience-ai-prepare`
3. UI: Smart upload tab в Data с drop-zone + textarea подсказки + кнопка Analyze
4. Preview-таблица с inline edit mapping
5. Confirm → существующий `createAudienceBatch`

**НЕ делаем в v1:**
- Полноценный chat (multi-turn) — пока single-shot Analyze. Multi-turn добавим v2 если будет нужно.
- Создание новых templates через AI
- Авто-распознавание prep_profile (юзер выбирает явно)

## Открытый вопрос

Куда положить таб переключения — наверх Data (Smart / Manual) или сделать Smart upload основным экраном, а Manual спрятать в "Advanced"? Я бы делал Smart основным с маленькой ссылкой "Advanced (manual mapping)" сбоку. Подтверди или скажи иначе.
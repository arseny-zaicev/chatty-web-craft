## Что чиним

Баг "Hey there there" — потому что `derived_payload` теряется при импорте из персонального Supabase, а Step 6 врёт что `var_1` смаплен.

## План

**1. Импорт сохраняет derived_payload**
`supabase/functions/import-audience-from-personal/index.ts`:
- В `.select(...)` добавить `derived_payload`
- При вставке в `audience_rows` передавать `derived_payload ?? {}`
- Бонус: если `derived_payload.var_1` пустой, но в `payload` есть `first_name` / `firstName` / `name` — авто-заполнить `var_1` из него на лету (чтобы старые батчи в персональном тоже не ломались)

**2. Починить уже сломанный батч**
Одноразовый UPDATE по `audience_rows` для батча `2026-05-18 | UK | Finance / Legal / Professional`:
- `derived_payload = jsonb_set(derived_payload, '{var_1}', to_jsonb(payload->>'first_name'))` там где `payload->>'first_name'` не пустой и `derived_payload->>'var_1'` пустой
- Применить ко всем строкам этого батча (не только к +447341272505)

**3. Честный маппинг в Step 6 (LaunchWizard)**
`src/components/.../LaunchWizard.tsx` (шаг маппинга):
- Для каждой переменной из `variable_schema` сэмплить N=20 строк и проверять что значение реально резолвится из `payload[key]` или `derived_payload[key]`
- Считать "mapped" только если ≥80% сэмпла даёт непустое значение
- Иначе показывать жёлтый бейдж "0/20 rows have var_1 - mapping will fall back to 'there'"

**4. Guard на "there there"**
`supabase/functions/_shared/template.ts` (рендер превью) + `campaigns/index.ts` (launch validation):
- Если в шаблоне идёт литерал `there` непосредственно перед `{{N}}` И `{{N}}` резолвится в `there` (fallback) — блокировать launch с понятной ошибкой
- В превью подсвечивать строку красным

**5. Health-check на странице Data**
Маленький warning-бейдж на батче: "⚠ var_1 missing in 18/20 sampled rows" если schema объявляет переменную, но её нет в данных.

**6. Проверка**
- Перезапустить импорт батча → убедиться что `derived_payload.var_1 = "Isabell"` для +447341272505
- Открыть Launch Wizard → превью показывает "Hey Isabell, Elena here..."
- Создать тестовый батч без `first_name` → launch блокируется

## Файлы
- `supabase/functions/import-audience-from-personal/index.ts` (правка select + insert + fallback)
- одноразовый SQL UPDATE для починки данных
- `src/components/launch/LaunchWizard.tsx` (честный маппинг Step 6)
- `supabase/functions/_shared/template.ts` (guard)
- `supabase/functions/campaigns/index.ts` (launch validation)
- `src/pages/Data*.tsx` / соответствующий компонент батча (health-бейдж)

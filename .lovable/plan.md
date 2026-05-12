## Что я понял (важно)

Я ошибся в прошлых правках. `variables_sample` из Gupshup — это **только эталонный пример** для прохождения модерации, один на весь шаблон. Использовать его как `__static:` в Launch — это ставить **одинаковый текст всем контактам** для `{{2}}` и `{{3}}`. Это **неправильно** — цель `{{2}}/{{3}}` именно в том, что у каждой строки своя уникальная подстановка (Variant 1: "retail channel expansion opportunities" / Variant 2: "business funding").

## Как это работает в Salesforge (rev-engineered)

1. **Data → Ingestion preset** (`src/lib/prepPresets.ts`) задаёт `variables: [{ key: "var_1", … }, { key: "var_2", … }, …]`.
2. При создании batch в `audience_batches.variable_schema` пишется массив `["var_1","var_2","var_3"]`.
3. Codex по промпту (`buildPresetPrompt`) парсит сырые строки оператора и инсёртит в `audience_rows` объект `derived_payload: { var_1: "Mark", var_2: "Acme Realty", var_3: "Sales lead" }` — **по строке на контакт, у каждого свои значения**.
4. Launch wizard (`audienceSource = "database"`):
   - `columns = dbBatch.variable_schema` = `["var_1","var_2","var_3"]`.
   - `variableNames = activeLogical.variables` = `["1","2","3"]` (для GO) или `["name"]` (Salesforge).
   - Auto-map в `LaunchWizard.tsx:260` пробует `var_<v>` → находит `var_1`/`var_2`/`var_3` для numeric vars.
   - При рендере (`LaunchWizard.tsx:546`) берёт `r.payload[src] ?? r.derived_payload[src]` — то есть **per-row уникальное значение**.
5. Salesforge сработал, потому что batch был создан через preset, `derived_payload` имеет `var_1`, `var_2` и т.д. — мэтч идеальный.

## Почему goflow сломан

- Для goflow batch создавали либо без preset, либо CSV-аплоад (без колонок `var_2`/`var_3`), либо preset с одной переменной (`marketing_basic` имеет только `var_1`).
- В Step 6 numeric `{2}`, `{3}` ничего не находят → fallback в `__static:<sample>` ставит **один и тот же** "retail channel expansion opportunities" всем 1000 контактам.
- Никаких варнингов, что это означает «всем одинаковый текст» — оператор не знает, что данные нужно готовить иначе.

## Что меняем

### 1. Launch Wizard — убрать тихий static-fallback, заменить варнингом

`src/pages/workspace/LaunchWizard.tsx` (Step 6, строки 244-276):

- **Удалить** автоподстановку `__static:${sample[i]}` для numeric vars. Sample-копия больше не считается валидным дефолтом.
- Вместо неё — для каждой нерасмапленной numeric переменной показать **жёлтый inline-warning** прямо в Step 6:
  ```
  {2} → no column matched in this audience.
  Per-row data missing. Each contact will receive the SAME text.
  Recommended: re-prepare the batch with a preset that defines var_2.
  Sample copy from template (read-only): "retail channel expansion opportunities"
  [ Use sample for everyone (not recommended) ]  [ Set static value ]
  ```
- Если оператор всё-таки жмёт «Use sample» — пишем static, но маркируем поле бейджем `Same for everyone` (красный outline).
- В Step 8 (Launch summary) — отдельный блок «Per-row variables» со списком переменных и источником: `{1} ← derived_payload.var_1 (per-row)` или `{2} ← static "…" (same for everyone)`. Если хоть одна `static for everyone` — Launch button становится `secondary` + текст "I understand all contacts get the same text for {2}, {3}".

### 2. Database source — варнинг на этапе выбора batch

В Step 5 (Audience), когда выбран DB batch и активный template имеет `variables.length > 0`:
- Сравнить `template.variables` (после маппинга на `var_<n>`) с `dbBatch.variable_schema`.
- Если не хватает — Alert: `This audience does not provide var_2, var_3. Either pick another batch or re-prepare with a preset that includes them. Step 6 will fall back to one-size-fits-all text.`
- Кнопка `Open Data prep →` (deep-link на `/ws/<slug>/data`).

### 3. CSV source — то же

Если `audienceSource === "csv"` и `variableNames` содержат numeric, проверить, что CSV header содержит `var_2`/`var_3` (или эквивалент). Иначе — тот же Alert + ссылка на пример CSV (`phone,name,var_2,var_3`).

### 4. Prep prompt — явно требовать numeric vars шаблона

`src/lib/prepPresets.ts`:
- Добавить новый preset `marketing_per_row_2` и `marketing_per_row_3` (1 имя + 1-2 per-row вариативных предложения), категория `marketing`. Это покрывает GO Greece/Malta и FB Marketing-стиль шаблонов.
- В `buildPresetPrompt` добавить блок `TEMPLATE VARIABLE CONTRACT`:
  ```
  The WhatsApp template uses placeholders {{1}}, {{2}}, {{3}}.
  Each must be filled per-row from the source data:
    {{1}} ← derived_payload.var_1  (first name)
    {{2}} ← derived_payload.var_2  (per-contact context, NEVER a constant)
    {{3}} ← derived_payload.var_3  (per-contact context, NEVER a constant)
  If two rows would receive the same var_2/var_3 value — that is a data quality bug. Flag it.
  ```
- В `WORKFLOW FOR CODEX` шаг 7: «Sanity check: for var_2 and above, count distinct values. If `distinct < 0.3 * total_valid` — print a warning, do not insert.»
- В `DO NOT` добавить: `do NOT copy the template "Sample" text into every row — that defeats the per-row variable system`.

`src/lib/prepProfiles.ts` (custom profiles): тот же `TEMPLATE VARIABLE CONTRACT` + sanity-check шаг.

### 5. Sync templates — оставить `variables_sample` как **read-only reference**

`supabase/functions/campaigns/index.ts` (`syncTemplates` и `extractSamplesByAlignment` уже добавили):
- Ничего не ломаем. `variables_sample` продолжает писаться, но теперь его роль — справочник для оператора («так выглядел один из примеров при модерации»), а не источник для Launch.
- В `TemplatesView` бейдж sample-copy переименовать из `Sample copy: ✓` в `Reference sample (moderation only)` — чтобы не путать.

### 6. Документация в коде

Шапка-комментарий в `LaunchWizard.tsx` Step 6 и в `prepPresets.ts`:
```
VARIABLE SOURCE PRIORITY (per recipient):
  1) audience column matching var_<n> or variable name        → per-row
  2) static value explicitly set by operator in Step 6        → same for all
  3) (DEPRECATED) template Gupshup sample                     → never auto, only manual
Anything below #1 means EVERY contact gets the same text — that is a data prep bug, not a feature.
```

## Технические детали

```ts
// LaunchWizard.tsx — replace lines 250-276
useEffect(() => {
  if (!variableNames.length) return;
  setMapping((prev) => {
    const next = { ...prev };
    let changed = false;
    variableNames.forEach((v, i) => {
      if (next[v]) return;
      const lower = v.toLowerCase();
      const stripped = lower.replace(/^var_/, "");
      const tryCols = [lower, `var_${stripped}`, stripped, `var_${i + 1}`];
      for (const candidate of tryCols) {
        const found = columns.find((c) => c.toLowerCase() === candidate);
        if (found) { next[v] = found; changed = true; break; }
      }
      // NO sample fallback here. Numeric vars without a column = explicit operator action.
    });
    return changed ? next : prev;
  });
}, [variableNames, columns]);

// New: per-variable warning state
const variableSourceKind = (v: string): "per_row" | "static" | "missing" => {
  const m = mapping[v];
  if (!m) return "missing";
  if (m.startsWith("__static:")) return m.length > "__static:".length ? "static" : "missing";
  return "per_row";
};
const sameForEveryoneCount = variableNames.filter((v) => variableSourceKind(v) === "static").length;
```

```ts
// Audience batch schema check (Step 5)
const requiredVarKeys = variableNames.map((v, i) => {
  const lower = v.toLowerCase();
  return /^\d+$/.test(v) ? `var_${v}` : (lower.startsWith("var_") ? lower : `var_${lower}`);
});
const missingFromSchema = requiredVarKeys.filter((k) => !columns.some((c) => c.toLowerCase() === k));
```

## Out of scope

- Не трогаем dispatcher / send-whatsapp.
- Не редактируем Gupshup `Sample` через API.
- Не меняем структуру `audience_rows` / `audience_batches` — только UI + промпты.
- Не делаем автогенерацию variant-копий через Lovable AI (это отдельная задача).

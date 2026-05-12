## 1. Inbox · numbers filter (Clients → Inbox)

**Сейчас:** стена чипсов с `display_name`/`label` каждого номера ("Bala Bangle", "My Curvera"…). Пиздец визуально + утечка названий клиента.

**Меняем (`src/pages/CRM.tsx`, ~строки 484-508):**
- Заменить ряд `<button>`-чипсов на одиночный dropdown в стиле существующего `select` "Recent" (sortMode) — тот же визуал, чтобы было консистентно.
- Опции:
  - `All numbers · N` (N = total conversations).
  - Один пункт на номер: `+971501234567 · 42 chats` — только телефон в международном формате, без `display_name`/`label`.
- Сортировка опций: по убыванию числа диалогов (самые активные сверху).
- Если у воркспейса ≤ 1 номера — dropdown не показывается вообще.
- Tooltip на dropdown: "Filter by sender number".

**Параллельно:**
- Удалить `friendlySenderLabel(n)` из этого места (оставить там, где он используется в шапке чата для оператора — проверим вызовы).
- В правой шапке чата (`activeNumber.label`) — оставить как есть для оператора-админа; клиент видит только в этом списке.

**Out of scope:** не трогаем чипсы Starred / My chats / Replied / Negative — они полезны.

---

## 2. Templates · потеря sample copy при синке

**Корень проблемы (`supabase/functions/campaigns/index.ts`, `syncTemplates`, ~541):**

Сейчас сохраняем только `container.data` — это тело с `{{1}}{{2}}{{3}}`. Gupshup в `containerMeta` отдаёт также:
- `example` (или `bodyExample`) — массив sample-значений для каждой переменной (`["John", "your D&B profile", "Our team noticed…"]`),
- `header` / `footer`,
- `exampleHeader`, `mediaUrl` для media-шаблонов,
- `buttons[].example` для URL-кнопок.

Эти поля сейчас пишутся только в `raw` (jsonb) и нигде не читаются. Поэтому в Launch wizard для GO Greece/Malta utility шаблонов превью показывает `Hi {1}, Bella here regarding {2}…` без подстановки.

**Что меняем:**

### 2a. Backend (`supabase/functions/campaigns/index.ts`, `syncTemplates`)
- Распарсить `container.example` / `container.bodyExample` / `t.example` (формат варьируется: иногда string `"[John|your D&B profile|Our team…]"`, иногда массив, иногда `{ body_text: [["…","…"]] }`).
- Нормализовать в массив строк и записать в новый jsonb-столбец `message_templates.variables_sample` (миграция).
- Также в payload upsert добавить `header_text`, `footer_text` (jsonb или text — text достаточно).
- Если у шаблона есть `variables.length > 0` но `variables_sample` пуст или короче — записать в `sync_warning` поле и вернуть в ответе кол-во "incomplete" шаблонов.

### 2b. Migration
```sql
alter table public.message_templates
  add column if not exists variables_sample jsonb default '[]'::jsonb,
  add column if not exists header_text text,
  add column if not exists footer_text text,
  add column if not exists sync_warning text;
```

### 2c. Launch Wizard (`src/pages/workspace/LaunchWizard.tsx`, Step 6)
При построении автомаппинга:
1. Если переменная имеет имя `1`/`2`/`3` (numeric) и есть `variables_sample[i-1]` — предложить `__static:<sample>` как дефолт + пометить бейджем `Auto-filled from template sample`.
2. Юзер всё равно может переопределить на column.
3. Если sample отсутствует — старый flow ("Action required").

### 2d. TemplatesView (`src/components/workspace/TemplatesView.tsx`)
- В строке шаблона показать индикатор `Sample copy: ✓ / ✗ Missing`.
- При синке если backend вернул `incomplete > 0` — toast warning: `N templates have variables but no sample copy. Edit them in Gupshup → "Sample" tab → re-sync.`
- В info-баннере вверху списка: короткая подсказка "Always fill the **Sample** field in Gupshup for every variable — required for previews and auto-mapping."

### 2e. Документация в коде
В `syncTemplates` коммент-чеклист сверху: какие поля вытягиваем, формат `example`, что делать если Gupshup поменяет схему.

---

## Технические детали

```ts
// campaigns/index.ts ~ inside syncTemplates, before upsert
const exampleRaw = container.example ?? container.bodyExample ?? t.example ?? null;
const variablesSample = parseGupshupExample(exampleRaw, vars.length);
// parseGupshupExample handles:
//  - array of strings
//  - { body_text: [[...]] }
//  - "[a|b|c]" pipe-string
//  - "{{1}} = a, {{2}} = b" colon-string fallback
const headerText = container.header || null;
const footerText = container.footer || null;
const incomplete = vars.length > 0 && variablesSample.length < vars.length;
```

```ts
// LaunchWizard Step 6 mapping init
const sample = template.variables_sample ?? [];
variableNames.forEach((v, idx) => {
  if (mapping[v]) return;
  const colMatch = audienceColumns.find(c => c.toLowerCase() === v.toLowerCase());
  if (colMatch) { mapping[v] = colMatch; return; }
  if (sample[idx]) { mapping[v] = `__static:${sample[idx]}`; autoFilledFromSample.add(v); }
});
```

---

## Out of scope

- Не меняем UI Pipeline / wizard Steps 1-5/7/8.
- Не трогаем dispatcher.
- Не редактируем шаблоны в Gupshup автоматически — только подсказываем юзеру что заполнить.
- Не делаем отдельную страницу "Templates health" — индикатора в существующем списке достаточно.

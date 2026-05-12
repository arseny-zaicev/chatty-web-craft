Спасибо за уточнение. Переделываю план с учетом:
- fallback фразы (`there`, `your team`, `your space`) допустимы ТОЛЬКО для `var_1` (имя), когда у конкретной строки нет имени.
- `var_2` и `var_3` в нашей модели - campaign-static. Они одинаковые для всей кампании и приходят из copy в Materials, а не из колонок данных.
- Текущая поломка goflow: оператор не передал в Codex значения для `{{2}}` и `{{3}}`, поэтому Codex применил name-fallbacks и к ним. Запись в БД формально валидна, но preview показывает мусор.

Что нашел в данных goflow batch `2026-05-11 | US | WA Groups + Hubspot`:
- 2808 valid rows
- `var_2`: 100% = `your team`
- `var_3`: 1089 = `your space`, остальные = названия групп
- Должно быть из Materials:
  - `var_2 = retail channel expansion opportunities`
  - `var_3 = We have a few exclusive incentives and partnership opportunities available with Amazon, Walmart, Target, Macy's, Nordstrom, Best Buy, Home Depot, and Lowe's, and I wanted to see if it may be worth exploring if your products are a fit.`

План

1) Concept fix in code: variable kinds

   В `prepPresets.ts` каждый preset variable получает поле `kind`:
   - `per_row` (var_1, source = `first_name`, fallback разрешен)
   - `campaign_static` (var_2, var_3 - один и тот же текст для всех контактов кампании)

   У `campaign_static` появляется поле `value: string` (заполняется при создании batch'а в UI - оператор вставляет текст из Materials).

2) UI: Create batch dialog (Data screen)

   Когда оператор кликает Create batch на goflow preset, он видит:
   - Country, Audience, Batch name (как сейчас)
   - Поля для каждой `campaign_static` переменной с лейблами:
     - "{{2}} - same text for everyone (paste from Materials):"
     - "{{3}} - same text for everyone (paste from Materials):"
   - Inline пояснение:
     "var_1 = per-row name (auto). var_2 / var_3 = same for everyone in this campaign. Paste exact copy from Materials below."
   - Validation: длина > 5 символов, не равно `your team / your space / there`, не содержит `{` / `}` / `{{`.

3) Prompt builder: hard contract

   `buildPresetPrompt` теперь печатает блок:

   ```
   VARIABLE CONTRACT (READ TWICE)
     var_1 (per_row): from `first_name`. If empty -> fallback "there". OK to repeat.
     var_2 (campaign_static): EVERY row MUST have this exact value:
       """
       <pasted var_2>
       """
     var_3 (campaign_static): EVERY row MUST have this exact value:
       """
       <pasted var_3>
       """

   DO NOT
     - apply name-fallbacks ("there", "your team", "your space", "your area", "your role", "your space") to var_2 / var_3
     - paraphrase, shorten, translate, or "personalize" var_2 / var_3
     - leave var_2 / var_3 empty
     - copy template Gupshup "Sample" text

   SANITY CHECK BEFORE INSERT
     - var_1 distinct count > 50% of rows OR all rows are anonymous (then fallback "there" allowed)
     - var_2 == exact value above for 100% of rows
     - var_3 == exact value above for 100% of rows
     If any check fails -> STOP, print which rows failed, do not insert.
   ```

   Старое правило "var_2/var_3 must be unique per row" удаляется. Это была моя ошибка - оно не отражает реальную модель.

4) UI: tooltip / explainer near every prompt

   Над каждым "Copy prompt" блоком (Data presets и Custom prep profiles) выводится короткая шпаргалка в свернутом блоке:

   ```
   How variables work:
   - var_1 = per recipient (name). Fallback "there" allowed.
   - var_2, var_3 = same for everyone in this campaign. Paste exact text in the Create batch step.
   - Never use "your team", "your space" for var_2 / var_3.
   ```

   Это снимает риск, что в следующий раз оператор отправит Codex prompt без значений.

5) Launch Wizard: pre-launch QA на реальных строках

   В Step 5 / Step 6 вычисляется per-batch QA по `audience_rows.derived_payload`:
   - per_row variable: distinct ratio > 30% OR один константный fallback `there` (тогда warning, не блок)
   - campaign_static variable:
     - все строки должны иметь одно и то же значение
     - значение не должно входить в banned list: `your team`, `your space`, `your area`, `your role`, `there`, пустая строка
     - длина > 5 символов
   - Если фейл - красный блок:
     "var_2 looks broken: 2808 rows have value 'your team'. Expected campaign-static copy from Materials. Re-prepare the batch."
   - Кнопка Launch блокируется при фейле campaign_static.

6) Step 8 Preview: source breakdown

   Под каждым sample message добавляется:

   ```
   {{1}} <- derived_payload.var_1 (per-row): "Ray Mondelle"
   {{2}} <- derived_payload.var_2 (campaign-static): "retail channel expansion opportunities"
   {{3}} <- derived_payload.var_3 (campaign-static): "We have a few exclusive..."
   ```

   Если значение в banned list, оно подсвечивается красным.

7) Backfill текущего goflow batch

   Migration: для batch `2e0706f3-9933-49e2-8d44-a9529a71c6a0`, для всех `validation_status = 'valid'` AND `usage_status = 'unused'`, обновить `derived_payload`:
   - `var_2` = `retail channel expansion opportunities`
   - `var_3` = `We have a few exclusive incentives and partnership opportunities available with Amazon, Walmart, Target, Macy's, Nordstrom, Best Buy, Home Depot, and Lowe's, and I wanted to see if it may be worth exploring if your products are a fit.`
   - `var_1` оставить.

   После этого preview будет показывать корректное сообщение.

8) Что НЕ трогаю

   - Код dispatcher / Gupshup отправки.
   - `import-audience-from-personal` - отдельной задачей при необходимости (но добавлю в notes: сейчас функция не тянет `derived_payload`, так что pull из personal базы в любом случае ломает campaign-static модель и должен быть пересмотрен отдельно).
   - Auto-variant generation, audience_batches схему.

Результат

- В UI рядом с каждым промптом будет короткое описание разницы var_1 vs var_2/var_3.
- Codex получит жесткий contract с exact значениями для campaign-static переменных и явным запретом fallback.
- Launch Wizard заблокирует запуск, если var_2/var_3 в БД сломаны.
- Текущий goflow batch будет починен миграцией, и preview покажет правильное сообщение из Materials.
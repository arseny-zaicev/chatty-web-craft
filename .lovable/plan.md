# Plan: Multi-number routing in Pipeline config

## Что уже есть в коде (не трогаем)
- `lead-dispatch` уже round-robin раскидывает входящие из Google Sheets лиды по всем выбранным номерам (`siblings[i % siblings.length]`).
- В `PipelineConfigSheet.tsx` поле `Default sender numbers` (строка 647) — это уже мульти-выбор: каждый номер это toggle-pill, можно тапнуть несколько.
- Те же номера остаются в общем пуле `whatsapp_numbers` и доступны в Launch Wizard для обычных рассылок (никакой эксклюзивности нет).

**Скорее всего ты не видишь мульти-выбор потому что pill'ы выглядят как один select.** Делаем UX явным.

## Что меняем (только UI, `src/components/workspace/PipelineConfigSheet.tsx`)

1. **Заголовок и подсказка** возле поля сделать однозначными:
   - Label: `Sender numbers (round-robin routing)`
   - Hint: `Tap to select multiple. Leads from Google Sheets are distributed across selected numbers in turn (lead 1 → A, lead 2 → B, lead 3 → C, lead 4 → A...). Numbers stay available for regular campaigns.`

2. **Счётчик выбранных** рядом с label: `3 selected`. Кнопка `Select all ready` / `Clear`.

3. **Pill'ы** перерисовать как явные чекбокс-чипы: квадратик с галкой слева + название номера. Выбранные — primary, невыбранные — outline. Чтобы было видно, что это множественный выбор, а не сегмент-контрол.

4. **Превью распределения** под списком, когда выбрано ≥2 номера:
   - `Round-robin order: A → B → C → A...`
   - `Daily cap split: ~{cap/N} per number`

5. **В списке pipelines** (`PipelinesView`) показать chip с количеством sender-номеров (`3 numbers`) вместо текущего отображения, чтобы было видно снаружи.

## Что НЕ меняем
- Логика `lead-dispatch` остаётся как есть (round-robin уже работает).
- БД, RLS, edge functions — без изменений.
- Поле `default_sender_number_ids` уже массив — миграции не нужны.
- Веса/пропорции (50/30/20) не вводим — ты выбрал равномерное распределение.

## Файлы
- `src/components/workspace/PipelineConfigSheet.tsx` (UI блока Default sender numbers)
- `src/components/workspace/PipelinesView.tsx` (chip с количеством номеров в строке pipeline)

## Goal

Когда при добавлении номера в Fleet Registry поле **Ref** оставляют пустым, считать что это собственный аккаунт (без реферала) и явно это показывать. Атрибуция (Provided by + Ref / Own) должна автоматически наследоваться на Business Manager при привязке номера и отображаться в разделе Partners.

## Текущее состояние

- `whatsapp_numbers.provided_by` и `whatsapp_numbers.assigned_ref` уже существуют (см. Fleet Registry форму, строки 1249-1256).
- В Fleet таблице атрибуция собирается строкой: `provided_by | Ref ...` (строка 810). Если оба пусты, fallback на `partner_source`.
- В Business Manager Detail нигде не отображается, кто предоставил номер и через какого реферала.
- В разделе Partners нет агрегации "сколько номеров привёл этот партнёр / собственных".

## Изменения

### 1. Fleet Registry — явная семантика "Own"

Файл `src/pages/admin/FleetRegistry.tsx` (диалог Add/Edit number, строки 1249-1256):

- Над полями Provided by / Ref добавить тумблер / Select **"Source"** с двумя опциями:
  - `Own account` (no referral) — по умолчанию для новых
  - `Referred by partner`
- Когда выбран `Own account`:
  - поля Provided by / Ref скрыты
  - на сохранение: `provided_by = "Self"`, `assigned_ref = null`
- Когда выбран `Referred by partner`:
  - показываются текущие поля Provided by / Ref (Ref становится обязательным, иначе кнопка Save заблокирована)
- При открытии существующего номера определять режим: `assigned_ref` пуст и `provided_by IN (null, "Self")` → Own.

В таблице Fleet (строка 810) скорректировать рендер атрибуции:
- Если Own → бейдж `Own` (нейтральный outline).
- Если есть Ref → бейдж `Ref: {assigned_ref}` + подпись `via {provided_by}`.

### 2. Business Manager Detail — отображение атрибуции номеров

Файл `src/pages/admin/BusinessManagerDetail.tsx`:

- В select для `whatsapp_numbers` (строки 40-41) добавить `provided_by, assigned_ref`.
- В списке привязанных номеров рядом с phone_number / display_name выводить компактный бейдж атрибуции (та же логика, что в Fleet таблице: `Own` либо `Ref: X · via Y`).
- В шапке BM (агрегат) показывать строку **Sources**: count Own / count by partner (например: `5 Own · 3 via Nitish · 2 via Kartik`). Чисто read-only.

### 3. Partners — агрегат по номерам

Файл `src/pages/admin/Partners.tsx` (или там, где список партнёров):

- Добавить агрегат: для каждого партнёра-реферала посчитать число `whatsapp_numbers` где `assigned_ref ILIKE partner.name` (текущая модель строковая) и показать колонку **Numbers referred**.
- Добавить отдельную карточку / строку **Own numbers** = `count(whatsapp_numbers WHERE assigned_ref IS NULL OR provided_by = 'Self')`.

Никаких миграций БД не требуется — поля уже есть.

### 4. Технические детали

- Никаких изменений схемы.
- Нормализация `assigned_ref`: trim() при сохранении; пустая строка → null.
- В Fleet типе `provided_by: "Self"` — sentinel-значение, использовать константу.
- Хук `bm.attribution` — небольшой helper в `src/lib/` для одинакового рендера бейджа во всех местах (Fleet table, BM detail, опционально Partners).

## Out of scope

- Не меняем Workspace Numbers Inventory (пользователь указал только Partners + BM).
- Не делаем CRUD для партнёров на основе assigned_ref (остаётся свободный текст).
- Никаких изменений в `bm_partner_assignments` / `number_ownership` — эти таблицы про ownership/payouts, а здесь — про источник номера.

## Что не так и что починим

### 1) Статистика по партнёрам — везде нули / неправда

**Корень проблемы:** функция `fetchPartnerMetrics` (`src/lib/metrics.ts`) считает "Sent today / all-time" по таблице `number_ownership`, в которой **ровно 0 строк во всей базе**. Поэтому в `/admin/partners` (колонки Sent today, Sent all-time) и в верхней плашке `/admin/partners/:id` (Sent today, Sent all-time) всегда показывается 0 / любая ерунда, хотя в табличке BM внизу той же страницы цифры правильные — те считаются через другой источник (`number_live_stats` по `business_manager_id`).

**Что сделаем:**
- Перепишу `fetchPartnerMetrics` так, чтобы партнёр → его BMы (через активные `bm_partner_assignments` где `effective_to IS NULL`) → номера (`whatsapp_numbers.business_manager_id IN (...)`) → агрегируем `number_live_stats` (тот же RPC, что использует BM-таблица).
- Результат: цифры в строке партнёра в списке + в верхней плашке совпадут с суммой по строкам BM внутри партнёра. Никаких "0".
- Таблицу `number_ownership` не трогаем — она пустая и не используется нигде ещё критично, оставим как есть.

### 2) В стате нет "Delivered" — добавим везде, включая партнёров

Сейчас "Delivered" есть только в KPI воркспейса и в карточке отчёта кампании. В партнёрских и BM-разрезах его нет, потому что RPC `number_live_stats` возвращает только `sent_*` и `failed_*`, без `delivered_*`.

**Что сделаем:**
- Миграция: расширю `public.number_live_stats(p_number_ids uuid[])` — добавлю `delivered_today bigint`, `delivered_7d bigint`, `delivered_all bigint`. Условие: `cr.status IN ('delivered','read')` (read = тоже доставлено и прочитано). Sent остаётся как было (`sent | delivered | read`), чтобы Delivered ≤ Sent.
- На фронте добавлю колонку **Delivered today** и в `/admin/partners` (список), и в `/admin/partners/:id` (верхняя плашка + строки BM), и в `/admin/business-managers/:id` (плашка статов). Везде в формате `Delivered / Sent` (например, `1,180 / 1,205`), чтобы сразу видна была доставляемость.

### 3) Не добавляются номера под партнёра / BM

В попапе "Attach" пул номеров фильтруется как `business_manager_id IS NULL AND workspace_id = <ws партнёра>`. Поэтому "No numbers available" — все номера, которые есть, уже привязаны к каким-то BM (часто к другому BM этого же или соседнего воркспейса) либо лежат в другом воркспейсе.

**Что сделаем в попапе "Attach" на `PartnerDetail` (компонент `AddNumbersToBmButton`) и в "Attach" на `BusinessManagerDetail`:**
- Уберу жёсткий фильтр по `workspace_id`. По умолчанию покажу **все** свободные номера (`business_manager_id IS NULL`) из всех воркспейсов, с маленькой подписью у каждого "ws: <name>" чтобы было видно откуда тянем.
- Добавлю переключатель **"Show numbers attached to other BMs"** — когда включён, показываются и уже занятые номера (с пометкой "сейчас в BM XYZ"). При выборе такого номера на attach мы автоматически переносим его (обновляем `business_manager_id` + пишем event в `bm_number_events`), без ручной отвязки.
- При attach пропишем `workspace_id` партнёрского BM, чтобы номер сразу оказался в правильном воркспейсе.
- Поиск по номеру/имени сверху, чтобы быстро искать когда пул большой.

## Технические детали

**Файлы:**
- `src/lib/metrics.ts` — `fetchPartnerMetrics` переписать: убрать `number_ownership`, идти через `bm_partner_assignments → whatsapp_numbers → number_live_stats`.
- `supabase/migrations/<new>.sql` — `CREATE OR REPLACE FUNCTION public.number_live_stats(...)` с добавлением `delivered_today/7d/all` (status IN ('delivered','read')).
- `src/pages/admin/Partners.tsx` — колонка `Delivered today`, формат `delivered / sent`.
- `src/pages/admin/PartnerDetail.tsx` — в верхней плашке `Delivered today` и `Delivered 7d`; в таблице BM колонки `Delivered today` / `Delivered 7d` / `Delivered all`; `AddNumbersToBmButton` — снять `workspace_id` фильтр, добавить toggle "show busy", поиск, авто-перенос.
- `src/pages/admin/BusinessManagerDetail.tsx` — карточка статов с `Delivered today/7d/all`; попап attach — те же изменения, что и для PartnerDetail.

**Что не ломаем:** RLS, существующие RPC сигнатуры (только дополнение полей), API кампаний.
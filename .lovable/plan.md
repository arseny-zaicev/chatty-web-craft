## Цель

В Fleet Analytics общий объём (Capacity) должен учитывать все номера, кроме `banned` и `restricted`. Сейчас учитываются только номера со статусом `active` — `ready` и `stock` пропадают. Также добавить разбивку: сколько номеров в стоке и по каким странам.

## Текущее поведение (`src/pages/admin/FleetAnalytics.tsx`)

- `isActiveStatus(s) = s === "active"` — только active попадают в capacity.
- `cap = isActiveStatus ? 200 * periodDays : 0` — для ready/stock cap = 0, и они не считаются в общем объёме.
- В шапке: «blocked numbers excluded», но фактически исключаются и stock/ready.

В БД сейчас: 16 active, 3 ready, 9 stock, 1 banned, 1 restricted. Есть колонка `country_code` и `daily_send_limit` per number.

## Изменения

### 1. Логика подсчёта capacity
- Заменить `isActiveStatus` на `isCountedStatus`: учитывать все статусы, кроме `banned` и `restricted`.
- Использовать per-number `daily_send_limit` (fallback 200) вместо жёсткой константы — это точнее отражает реальный объём.
- Добавить `country_code, daily_send_limit` в select `whatsapp_numbers`.

### 2. Новая агрегация по статусу/стране
В `fetchAnalytics` посчитать:
```
fleetBreakdown = {
  counted: { total, byStatus: { active, ready, stock }, byCountry: { US, UK, IN, ... } },
  excluded: { banned, restricted }
}
```
Стоковая разбивка по странам отдельно: `stockByCountry: { US: 8, UK: 1 }`.

### 3. UI

**KPI Capacity** — обновить sub-текст: вместо `X active × 200 × Nd` показывать `X numbers × daily limits × Nd · banned/restricted excluded`.

**Новая карточка «Fleet composition»** (компактная, над «Per-client breakdown») с тремя колонками:
- *Counted in capacity* — пилюли по статусам: `Active 16 · Ready 3 · Stock 9` и пилюли по странам: `US 21 · UK 4 · IN 1`.
- *Stock by country* — `US 8 · UK 1` (отдельно подсвечено, т.к. это резерв).
- *Excluded* — `Banned 1 · Restricted 1` с подписью «not counted in capacity».

Шапку «Capacity baseline 200/number/day - blocked numbers excluded» заменить на «Capacity = sum of per-number daily limits · banned & restricted excluded».

### 4. Per-client таблица
Колонка `Numbers` сейчас показывает `activeNumbers/numbers`. Поменять на `counted/total` (counted = не banned/restricted) для консистентности с новым capacity.

## Файлы

- `src/pages/admin/FleetAnalytics.tsx` — единственный файл изменений (логика + UI).

## Вне scope

- Изменения в БД, в других страницах (Fleet Registry, BM Detail).
- Изменение определения «активного» номера в других местах кода.

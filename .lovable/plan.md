# Campaigns: «один запуск = одна кампания»

Сейчас на странице `Campaigns` sibling-кампании по разным номерам уже мёрджатся в одну строку (`groupCampaigns` по базовому имени). Внутри есть Day-by-day и Per-number разбивка. Проблема - заголовок этого не передаёт: непонятно что это **один** многодневный запуск, и непонятно где смотреть итоговую статистику. Плюс «Today» в шапке создаёт впечатление, что строка - это «сегодняшний кусок».

## 1. Header строки кампании (`WorkspaceCampaigns.tsx`)

Сделать заголовок более «единым запуском»:

- Название (как есть, без `:: number`).
- Подзаголовок (одной строкой):
  `Total volume · 5 дней · 12-16 мая · today: 200`
  - `Total volume` = `group.total` (уже агрегировано по всем номерам).
  - Диапазон дат = первый и последний из `group.scheduledDates` (формат «12-16 May», в TZ страны кампании).
  - `today: N` показываем только если `group.today > 0`.
- Убрать показ количества номеров в подзаголовке (клиент это видеть не должен). Бейдж «N numbers» оставить **только** для manager/admin (`canManage`), и поместить в правый блок stats, не в подзаголовок.
- Правый блок (md+): `Sent X / Total`, прогресс-бар на ширину `~100px`, статус-бейдж. Без «Today» в шапке - оно уже в подзаголовке.
- Mobile (<md): прогресс-бар + `Sent/Total` под подзаголовком.

## 2. Раскрытая карточка (`CampaignDetail`)

Уже почти то что нужно, лёгкие штрихи:

- Сверху - чёткий блок «Campaign overview» с 4 KPI: **Total / Sent / Pending / Failed** (как сейчас, но без «Today» - сегодняшний день и так виден в Day-by-day подсвеченной строкой).
- Прогресс-бар под KPI: `sent / total` с процентом.
- Day-by-day таблица - оставить как есть, она и есть «статистика по дням».
- Per-number блок - **скрыть для не-менеджеров** (уже под `canManage`, оставляем).
- Intelligence report ниже - оставляем (replies/positive/meeting там).

## 3. Workspace Overview - топ-карточка активной кампании

В `WorkspaceOverview.tsx` под KPI добавить карточку «Active campaign» (если есть `running`/`scheduled` группа):

- Берём из того же `fetchCampaignSummaries` + `groupCampaigns`, фильтруем `status in (running, scheduled, paused)`, берём первую/самую свежую.
- Показываем: название, диапазон дат, прогресс-бар `sent/total` с процентом, «today: N», CTA «Open campaign →» ведёт в `/ws/${slug}/campaigns` (раскрыв нужную через `?open=<key>` query param, который читает `WorkspaceCampaigns` и проставляет `openKey`).
- Если активных нет - карточку не показываем (или короткий «No active campaigns»).

## 4. Доп. правки

- В `splitBase`/группировке ничего не трогаем - логика уже верная.
- `todaySummary` больше не нужен в шапке строки (его роль забирает новый подзаголовок), оставим утилитой только если используется где-то ещё.
- Ничего не меняем в edge functions, schema, Slack дайджестах (юзер выбрал только Overview + страницу Campaigns).

## Технические детали

- Файлы: `src/pages/workspace/WorkspaceCampaigns.tsx`, `src/pages/workspace/WorkspaceOverview.tsx`.
- Прогресс-бар: используем существующий `@/components/ui/progress` (если уже есть) или простой div с `bg-primary` шириной `${pct}%`.
- Диапазон дат форматируем через `shortDateInTz` уже импортированный.
- Query-param `?open=<key>` в `WorkspaceCampaigns`: `useSearchParams`, при наличии - выставляем `openKey` один раз в `useEffect`.

```text
[ Goflow campaign                                              [running] ]
  Total 1,000 · 5 days · 12-16 May · today 200          [▓▓▓▓░░░░] 400/1,000
```

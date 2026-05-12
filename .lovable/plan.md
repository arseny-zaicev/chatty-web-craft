## Что не так сейчас

В шаге "Sender pool" → Marketing Blast, при quota 200 / 1 номер / 930 получателей:

1. **"Per day 186"** вместо 200. В `dayPlan` (LaunchWizard.tsx ~493) логика делит всех получателей поровну на `daysNeeded` (`ceil(930/5)=186`) и берёт `min(idealPerDay, dailyCap)`. Это правильно для Utility (плавное растягивание), но для Marketing Blast — нет: маркетинг шлёт **на максимум квоты** каждый день, остаток автоматически переезжает на следующий. Поэтому должно быть 200/день × 5 дней (последний день — 130).

2. **"Launch until" редактируется в Send now (Marketing).** Если режим Send now — кампания тупо стартует и улетает мгновенно, окно "до" бессмысленно. Можно менять только в Pick days (там оно ограничивает дневное окно отправки).

3. **Pool в Review: "-- · 1/2 ready"** — путает. Для Marketing мы выбираем **один** sender, и review должен отражать выбор: имя выбранного sender (или "1 sender · ready"), а не количество готовых из пула.

Плюс мелочь: в Review строка `Pool` начинается с "--" потому что `poolCountry` тут пустой/не отрисован — выглядит как баг.

## План

### 1. Per-day для Marketing = dailyCap (LaunchWizard.tsx, `dayPlan` useMemo, ~493)

Для marketing считать:
- `effectivePerDay = dailyCap` (т.е. 200), кроме последнего дня
- `daysNeeded = ceil(total / dailyCap)` (как сейчас)
- В Review строки `Per day` и `Per number / day` показывать `dailyCap` для маркетинга
- Опционально: добавить подпись "× N days, last day {remainder}" под Days needed

Utility логика остаётся как есть.

### 2. Заблокировать "Launch until" в Marketing + Send now (~1086)

```tsx
<Field label={isMarketing ? "Launch from" : "Window from"}>
  <Input type="time" value={windowStart}
    disabled={isMarketing && scheduleMode === "now"}
    onChange={...} />
</Field>
<Field label={isMarketing ? "Launch at" : "Window to"}>
  <Input type="time" value={windowEnd}
    disabled={isMarketing && scheduleMode === "now"}
    onChange={...} />
</Field>
```

В Marketing + Send now: оба поля показывают "сейчас" (или просто disabled со значением windowStart="now"), потому что Blast стартует моментально. Альтернатива — оставить только одно поле "Launch at" и спрятать "until".

Предлагаю: **в Marketing + Send now скрыть `Launch until` целиком**, оставить только `Launch from` (это и есть момент старта). В Pick days оба поля активны (окно дня).

### 3. Review строка Pool (~1598)

Для marketing:
```tsx
<Row label="Sender" value={activeNumbers[0]?.label ?? "—"} />
```
вместо "Pool: -- · 1/2 ready". Для Utility оставить текущий формат "Country · X/Y ready".

Также убрать ведущее "--" когда `poolCountry` пуст.

### 4. Подправить пояснительный текст (~1118-1121)

Для Marketing + Send now:
> "Launches at {windowStart} · 200 msgs/day × 5 days (last day 130). Recipients in their local time."

Для Marketing + Pick days:
> "{N} day(s), {windowStart}-{windowEnd} window each day · up to 200/day."

## Файлы

- `src/pages/workspace/LaunchWizard.tsx` — единственный файл изменений (UI + dayPlan расчёт).

Бизнес-логику бэкенда не трогаем — payload уже шлётся с `delay=0` и `scheduler=poisson` для маркетинга, авто-rollover уже работает на бэке.

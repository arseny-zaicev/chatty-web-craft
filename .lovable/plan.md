# Анализ запуска "SMB Owners | GoSwyft Main"

## Что нашлось в БД (факты, не гипотезы)

Кампания `5acc6c71` (running):
- `whatsapp_number_id` = **один номер** `13Nitish02`. **Не 7 номеров.**
- `total_recipients` = 1000, отправлено 631, replied 48, failed 8, **scheduled = 313**.
- `scheduled_dates` = **`[]` (пустой массив)**.
- Окно `10:00-18:00` (локальное), country `US`, `respect_recipient_tz=true`.
- Все 313 невыехавших получателей стоят на **одной и той же секунде** `2026-05-14 05:00:00 UTC` — это `endUtc` PT-бакета (22:00 PDT = край окна), куда планировщик "сжал" всё, что не влезло в сегодняшнее окно.

Предыдущая (отменённая) версия `eef50c7d` была на **другом номере** `12Nitish01` и имела `scheduled_dates=[2026-05-13, 14, 15]` — корректное растягивание на 3 дня. После cancel + relaunch обе настройки (мульти-номер и мульти-день) были потеряны.

## Корневые причины

### Причина 1 — Релонч после cancel потерял план мульти-дней
Wizard при пересоздании отправил `scheduled_dates: []`. В `supabase/functions/campaigns/index.ts:570-572`:
```ts
const dates = scheduledDates.length > 0 ? [...scheduledDates].sort() : [todayKeyTz(tz)];
```
Пустой массив → планировщик считает что всё нужно успеть **сегодня**, без авто-роллинга на следующие дни.

### Причина 2 — Overflow не переносится на завтра, а коллапсится в endUtc
`supabase/functions/campaigns/index.ts:618`:
```ts
scheduled_at: new Date(Math.min(endUtc, Math.max(earliest, ts))).toISOString()
```
Если `ts` (расчётное время отправки) выходит за окно — вместо переноса на следующую дату все хвосты "слипаются" в одну секунду на конце окна. Результат: 313 сообщений с одинаковым `scheduled_at`, которые либо не отправятся (диспетчер ограничивает скорость), либо упрутся в rate limit Gupshup → массовый failed.

### Причина 3 — Нет split на 7 номеров
Wizard сохранил кампанию с `whatsapp_number_id = одно значение` (нет sibling-кампаний `:: <label>` от 12Nitish01..12Nitish07). Либо оператор выбрал 1 номер, либо UI/валидация позволила пройти дальше с одним номером без предупреждения.

### Причина 4 — Нет жёсткой проверки "all recipients fit in window × dates × numbers × dailyCap"
Препрелайт `feasibility` (LaunchWizard:565) показывает overflow как "soft warning", но не блокирует кампанию, у которой не хватит времени/окна для 1000 на 1 номере за 1 день.

### Причина 5 — Нет фоновой задачи "rebalance overflow → next date"
`campaign-day-rollover` только эмитит Slack-событие конца дня. Нет джоба, который берёт `status=scheduled AND scheduled_at == endUtc collapsed`, видит "осталось N штук — окно закончилось", и переносит их на `next_date + windowStart`.

---

## Решение (что чинить)

### Фикс 1 — Авто-extend `scheduled_dates` если пусто
Файл: `supabase/functions/campaigns/index.ts` (~570).
Если `scheduledDates.length === 0` И `slice.length > perNumPerDayCap`, расширять список дат вперёд (`today, today+1, today+2, ...`) пока всё не поместится. Не полагаться на оператора.

### Фикс 2 — Overflow → следующая дата вместо коллапса в endUtc
Тот же файл (~610-618). Когда `ts > endUtc` — не клампить, а перекладывать получателя в очередь следующего дня (push в массив `overflowToNext`, который обработается на следующей итерации `for (const date of dates)`). Если дат больше нет — добавить новую дату в конец.

### Фикс 3 — Cancel+Relaunch должен наследовать план
Файл: `src/pages/workspace/LaunchWizard.tsx`. При пересоздании кампании из отменённой подтягивать предыдущие `scheduled_dates`, `whatsapp_number_ids` (все sibling), `per_number_quota`. Показывать warning "вы запускаете на 1 номере вместо 7 в прошлый раз — продолжить?".

### Фикс 4 — Hard preflight gate
В `campaigns/index.ts` перед `INSERT campaigns`: проверить `total_recipients <= numbers.length × daysCount × perNumberDailyCap × utilization(0.9)`. Если нет — возвращать `409 preflight_warnings` с конкретной причиной "не хватит окна, добавьте N дней или M номеров", без `force: true` не пускать.

### Фикс 5 — Watchdog для "слипшихся" хвостов
Новая edge-функция `campaign-overflow-rebalance` (cron 30 мин):
- Найти `campaign_recipients status=scheduled` где >50 штук имеют идентичный `scheduled_at`.
- Перенести их на следующую разрешённую дату/окно с правильным jitter.
- Логировать в Slack для видимости.

### Фикс 6 — UI индикация per-number плана
В карточке кампании (Pipeline.tsx / WorkspaceCampaigns.tsx) рядом со счётчиком "today 423" показывать **список реально использованных номеров** и план "200 × 7" vs факт "1000 × 1". Чтобы оператор сразу видел расхождение с задумкой.

### Фикс 7 — Бэкфилл текущей кампании
Одноразовая миграция: для `campaign_id=5acc6c71` взять 313 `status=scheduled`, перераспределить по дате `2026-05-14` в окно 10:00-18:00 PT/ET с правильным jitter. Без этого они либо отвалятся с rate limit, либо отправятся ночью одним залпом.

---

## Технические детали (чтобы не повторилось)

```text
причина → код → фикс
─────────────────────────────────────────────────────
relaunch потерял dates  → wizard 749         → wizard helper "inheritFromCancelled"
overflow слипается      → campaigns 618      → push в overflowToNext очередь
1 номер вместо 7        → wizard UI          → preflight require ≥N numbers
soft warning игнорится  → campaigns 455      → жёсткий 409 без force
нет ребаланса           → нет джоба          → новая cron-функция
```

## Порядок работ
1. Бэкфилл текущих 313 (Фикс 7) — критично, час.
2. Фикс 1 + 2 (rollover + overflow rebalance в момент создания) — основа.
3. Фикс 4 (hard preflight) — защита от повтора.
4. Фикс 3 (наследование при relaunch).
5. Фикс 5 (watchdog) + Фикс 6 (UI) — последний слой.

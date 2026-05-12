# Slack: правильная семантика scheduled / launched / day completed

## Что не так сейчас

**Launch now:**
- Кампания всегда создаётся со статусом `running` → триггер шлёт `campaign_launched` сразу, даже если первый месседж уйдёт через 12 часов.
- В Slack показывается **общий объём базы** (7,571), а не сколько уйдёт сегодня.
- `First send` = `now()`, а не реальное время первой отправки.
- Подпись `09:00-20:00 UAE` захардкожена, хотя кампания может быть по US/NY.

**Конец дня (`campaign_day_completed`):**
- Показывает только `Today: N sent · M failed` и `Next batch`.
- Нет данных по ответам, позитиву и скорости менеджеров.

## Целевое поведение

### 1. При нажатии Launch (вне окна или будущая дата)
Клиент получает `📅 Campaign scheduled`:
- **Today:** сколько уйдёт сегодня.
  - Если сегодня ничего не уйдёт — показать дату следующего дня вместо "0 today" (например `Starts 13 May`).
- **First send:** точное время первой отправки в TZ получателя (`Today 09:00 New York` / `13 May 09:00 New York`).
- **Window:** `09:00-20:00 New York` (TZ из страны пула, не UAE).

### 2. Когда первый месседж реально уходит
`🚀 Campaign launched`:
- **Today:** сколько уйдёт сегодня.
- **Started:** фактическое время первого `sent`.

### 3. Если Launch попадает прямо в окно
Один месседж `🚀 Campaign launched` (today-count + правильная TZ).

### 4. В конце дня (`✅ Campaign day finished`)
- **Sent today:** N
- **Replies:** R (P% reply rate)
- **Positive:** Q (S% of replies)
- **Avg manager response (positive):** Xm Ys (если есть данные, иначе `—`)
- **Next batch:** показывать ТОЛЬКО если есть запланированный следующий день. Если нет — `Next batch: not scheduled yet`.

## Технические шаги

### 1. Миграция БД
Добавить в `campaigns`:
- `today_recipients_count int default 0`
- `recipient_country text` (ISO для TZ)
- `first_scheduled_at timestamptz`

Обновить триггер `enqueue_campaign_slack_event`: добавить эти поля в payload всех `campaign_*` событий.

### 2. `supabase/functions/campaigns/index.ts` (createCampaign)
- Считаем `rows`, сортируем по `scheduled_at`.
- `firstScheduledAt = rows[0].scheduled_at`.
- `todayCount` = строки, попадающие в «сегодня» в TZ получателя (по `country_code` основного номера).
- Решаем статус:
  - `firstScheduledAt > now + 120s` → INSERT `draft`, потом UPDATE → `scheduled` (триггер шлёт `campaign_scheduled`).
  - Иначе → INSERT `running` (как сейчас, триггер шлёт `campaign_launched`).
- Записываем `today_recipients_count`, `recipient_country`, `first_scheduled_at`, `scheduled_start_at = firstScheduledAt`.

### 3. Промоушен `scheduled → running`
В начале `processQueue`:
```sql
UPDATE campaigns SET status='running'
WHERE status='scheduled' AND first_scheduled_at <= now() + interval '60 seconds'
```

### 4. `supabase/functions/campaign-day-rollover/index.ts`
Перед enqueue `campaign_day_completed` добавить за окно дня (по recipient TZ):

- **replies_today** — `count distinct conversation_id` из `messages` где `direction='inbound'` и conversation связан с этой кампанией.
- **positive_today** — `count` из `conversation_insights` где `reply_intent IN ('positive','interested','warm')` и conversation из этой кампании.
- **avg_manager_response_seconds** — средний интервал между первым `inbound` (positive) и следующим `outbound` менеджера (`sent_by_user_id IS NOT NULL`) в той же conversation.
- **next_day** — оставить только если действительно есть запланированный день из `scheduled_dates` после сегодня; иначе передать `null`.

### 5. `supabase/functions/_shared/slackBlocks.ts`
- Для `campaign_scheduled` / `campaign_launched`:
  - `Volume` → `Today` (`today_recipients_count` msgs). Если 0 — заменить на `Starts <date>` без слова "today".
  - `Window` берёт TZ из `recipient_country`.
  - `First send` / `Started` форматируется в TZ получателя.
- Для `campaign_day_completed`:
  - `Replies: R (P% reply rate)`.
  - `Positive: Q (S% of replies)`.
  - `Avg response: Xm Ys` (или `—`).
  - `Next batch:` показываем только при наличии `next_day`; иначе `Next batch: not scheduled yet`.

## Файлы
- `supabase/migrations/<new>.sql` — колонки + апдейт триггера
- `supabase/functions/campaigns/index.ts` — статус-логика, today-count, промоушен
- `supabase/functions/campaign-day-rollover/index.ts` — replies/positive/avg-response метрики + next_day гард
- `supabase/functions/_shared/slackBlocks.ts` — рендер today/TZ + расширенный day-completed блок

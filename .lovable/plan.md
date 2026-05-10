## Цель

Каждые 5 минут читать новые письма от Gupshup на `iskra.gupshup.alerts@gmail.com`, классифицировать их (quality drop / restriction / template rejected / billing / прочее), привязывать к нашему `whatsapp_numbers` по номеру или WABA ID, и слать структурированный алерт в Slack-канал `SLACK_OPS_NUMBERS_CHANNEL_ID` (тот же, что используют существующие алерты `enqueue_number_slack_event`).

## Архитектура

```text
Gupshup -> Gmail (iskra.gupshup.alerts@gmail.com)
                |
                v
   gupshup-mail-poll (Edge Function, cron */5 мин)
                |
                v
   public.gupshup_mail_log  (idempotency, status, raw)
                |
                v
   public.slack_event_queue  (event_type='gupshup_mail_alert')
                |
                v
   slack-dispatch -> SLACK_OPS_NUMBERS_CHANNEL_ID
```

## Что сделаем

### 1. Шаг настройки в Gupshup (вручную пользователем)
Прежде чем разворачивать функцию, ты заходишь в Gupshup → Account / Notification settings и ставишь `iskra.gupshup.alerts@gmail.com` как notification email на всех аккаунтах/WABA. Я укажу точные шаги в чате.

### 2. БД (одна миграция)
- `public.gupshup_mail_log` — таблица:
  - `gmail_id` (text, unique) — `id` сообщения Gmail для идемпотентности
  - `received_at` (timestamptz)
  - `from_address`, `subject`, `snippet`
  - `category` enum: `quality_drop` | `restriction` | `block` | `template_rejected` | `template_approved` | `billing` | `account_review` | `other`
  - `severity` enum: `info` | `warning` | `critical`
  - `whatsapp_number_id` (uuid, nullable, FK)
  - `workspace_id` (uuid, nullable)
  - `parsed` jsonb (вытащенные phone, waba_id, template_name и т.д.)
  - `slack_event_id` (uuid, nullable, FK → slack_event_queue)
- RLS: только `is_admin(auth.uid())` читает; запись только service_role.
- `public.gupshup_mail_state` (single row) — хранит `last_history_id` или `last_internal_date_ms` курсора Gmail.

### 3. Edge Function `gupshup-mail-poll`
- Идём через connector gateway: `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages?q=from:gupshup.io OR from:gupshup.com newer_than:1d&maxResults=50`.
- Для каждого `id` сверяемся с `gupshup_mail_log.gmail_id`; новые — берём `messages/{id}?format=full`, парсим headers + body.
- Парсер по subject/keywords:
  - `quality.*low|medium|high|drop` → `quality_drop`
  - `restrict|throttle|messaging limit` → `restriction`
  - `block|disabled|banned` → `block`
  - `template.*rejected|approved|paused` → `template_rejected/approved`
  - `payment|invoice|low balance|funds` → `billing`
  - `policy review|account review` → `account_review`
- Извлекаем `phone_number` (regex `\+?\d{10,15}`) и `waba_id`. По `phone_number` ищем `whatsapp_numbers` → получаем `whatsapp_number_id`, `workspace_id`.
- Severity: `block`, `restriction`, `billing` → `critical`; `quality_drop`, `template_rejected`, `account_review` → `warning`; остальное → `info`.
- Вставляем строку в `gupshup_mail_log` (ON CONFLICT DO NOTHING по `gmail_id`).
- Для `severity != 'info'` (или всё, если попросишь) — вставляем событие в `slack_event_queue` с `event_type = 'gupshup_mail_alert'` и payload `{ category, severity, phone_number, whatsapp_number_id, subject, snippet, gmail_link }`.
- Возвращаем `{ scanned, new, alerts }` для логов.

### 4. Slack handler
В `supabase/functions/slack-dispatch/index.ts` добавить обработчик `gupshup_mail_alert`:
- Канал: `SLACK_OPS_NUMBERS_CHANNEL_ID`.
- Блок: emoji по severity (🔴/🟠/🔵), категория, номер (если найден — со ссылкой на CRM), subject, выдержка из письма, кнопка "Открыть в Gmail" (`https://mail.google.com/mail/u/0/#inbox/{gmail_id}`).
- Использовать существующий хелпер `slackBlocks.ts`.

### 5. Cron
Через `pg_cron` поднять расписание `*/5 * * * *` → `select net.http_post(...gupshup-mail-poll...)` с service-role auth (тот же паттерн, что у `numbers-health-sync`, посмотрю как он запланирован и повторю).

### 6. UI (минимум, опционально)
В `AdminPanel` (или Workspace Settings → Provider/Debug) добавить маленькую таблицу "Последние Gupshup-уведомления" с фильтром по severity, чтобы быстро глазами проверять. Можно отложить.

## Технические детали

- Gmail-коннектор использует `gmail.readonly` — этого достаточно. Никаких write-операций.
- Для идемпотентности используем Gmail `messages.id` (стабильный per-mailbox).
- Курсор `last_internal_date_ms` нужен только для оптимизации; первичная защита — unique index на `gmail_id`.
- Лимит первого запуска: `newer_than:7d` чтобы не разлить старые письма.
- Все запросы к Gmail — через gateway: заголовки `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GOOGLE_MAIL_API_KEY}`.
- Никаких новых секретов. Всё уже есть.

## Что вне scope

- Парсинг вложений (PDF-репорты Gupshup) — пока просто игнорим.
- Авто-действия (пауза кампаний при block) — только алерт.
- Ответ на письма из Gmail — нет, read-only.

## Acceptance criteria

1. Письмо от `noreply@gupshup.io` с темой "Phone number quality update" приходит → в течение ≤5 мин в Slack-канале появляется сообщение с категорией `quality_drop`, найденным номером и выдержкой.
2. Повторный запуск polling не дублирует алерт (unique по `gmail_id`).
3. В `gupshup_mail_log` видно все обработанные письма с категорией.
4. Письма не от Gupshup игнорируются.
5. Если номер из письма не найден в `whatsapp_numbers` — алерт всё равно уходит, поле "Number" = "Unmatched".

## Ручной чеклист после деплоя

- [ ] В Gupshup notification email = `iskra.gupshup.alerts@gmail.com` (на всех аккаунтах).
- [ ] Отправить тестовое письмо себе с темой "Phone number quality update" с номером из БД → ждать 5 мин → проверить Slack.
- [ ] `select * from gupshup_mail_log order by received_at desc limit 10;` — есть строки.
- [ ] `select * from slack_event_queue where event_type='gupshup_mail_alert' order by created_at desc limit 10;` — есть события и `processed_at` проставлен.
- [ ] Удалить тестовое письмо в Gmail → повторный poll не должен заново его слать.

Жми "Approve plan" — и я разверну: миграция → edge function → расписание cron → доработка `slack-dispatch`.
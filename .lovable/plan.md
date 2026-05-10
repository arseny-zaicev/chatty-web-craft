# План: чистый Slack + защита от дублей

## Что не так сейчас

**1. Slack-шум.** В канал пайплайна летят системные события: `lead.imported`, `lead.dispatched`, `lead.dispatch_blocked`, `lead.import_failed`. Клиенту это не нужно - импорт идёт постоянно автоматически. Нужны только реальные ответы лидов.

**2. Дубли отправки (Ankur 6×).** Сегодня одному номеру `918269603031` ушло **7 успешных** сообщений подряд из first-touch кампании. Причина: до фикса CHECK-constraint каждый запуск cron видел `lead_imports.status='awaiting_manual'` и создавал НОВЫЙ `campaign_recipient`, потому что апдейт статуса лида молча падал. Constraint мы починили, но защиты на уровне «1 first-touch на номер» в коде нет - если завтра снова что-то отвалится, опять начнётся спам.

---

## Что делаем

### A. Slack — оставить только реальные ответы лидов

В `slack-dispatch/index.ts`:
- **Удаляем** обработку и отправку для: `lead.imported`, `lead.import_failed`, `lead.dispatched`, `lead.dispatch_blocked` → помечаем как `skipped`, в Slack ничего не идёт.
- **Оставляем** `positive_lead` (когда менеджер пометил чат звёздочкой).
- **Добавляем новое событие `lead.first_reply`** - срабатывает, когда лид впервые ответил на наш first-touch. В Slack уходит карточка: имя, телефон, текст ответа, кнопка «Открыть в Inbox». Дубли по одному лиду не шлём (используем `last_auto_positive_alert_at` или новое поле).

Триггер для `lead.first_reply`: расширяем существующий `mark_lead_replied_on_inbound` - когда `lead_imports.status` переходит `sent → replied`, кладём событие в `slack_event_queue` с типом `lead.first_reply` и payload (conversation_id, contact_name, contact_phone, last_message_text, pipeline_id для маршрутизации в нужный канал).

### B. Жёсткая защита от повторной отправки

В `lead-dispatch/index.ts` перед каждым `INSERT` в `campaign_recipients` для first-touch:

1. **Проверка по `(pipeline_id, contact_phone)`**: если в `campaign_recipients` уже есть запись для этого телефона по любой first-touch кампании этого pipeline со статусом `pending/scheduled/sent/replied` - **пропускаем** (логируем `skipped: duplicate first-touch`). Лид помечается `status='skipped'` с понятной ошибкой.
2. **Только при `failed`** - разрешаем создать новую попытку (это ответ на пожелание «если ошибка - можем потом руками»).
3. Добавляем БД-индекс `idx_recipients_pipeline_phone_active` для быстрого lookup.
4. Те же 6 «лишних» recipients Ankur-у уже либо `failed`, либо доставлены - чистка не нужна, но добавим разовый SQL-сброс зависших `pending/scheduled` дублей по телефонам, у которых уже есть `sent`.

### C. Inbox - показывать ответы лидов на вопросы

Бонусом (вы просили раньше): ответы на квиз-вопросы из `lead_imports.payload` (company_name, email, BM ownership и т.д.) показываем в правой панели чата в Inbox под контактом - блок «Ответы из формы».

---

## Технические детали

**Файлы:**
- `supabase/functions/slack-dispatch/index.ts` - убрать ветку `lead.*`, добавить ветку `lead.first_reply` с карточкой.
- `supabase/functions/lead-dispatch/index.ts` - дедуп-проверка перед `INSERT campaign_recipients`.
- Migration: триггер `enqueue_first_reply_event` на `lead_imports` (AFTER UPDATE WHEN OLD.status='sent' AND NEW.status='replied'), плюс индекс для дедупа.
- `src/pages/.../Inbox*.tsx` (компонент правой панели) - подтянуть `lead_imports.payload` по `conversation_id` и отрендерить.

**Не трогаем:** campaign-events, number-events, gupshup_mail, inbox_unread_spike - они идут в ops-каналы, не в клиентский.

---

## Чего НЕ будет

- Авто-определения «yes/да/интересно» по тексту - вы выбрали «любой первый ответ», поэтому слать будем на любое первое входящее (без классификации).
- Уведомлений об импортах - полностью молчим.
- 30-дневной блокировки - только жёсткая по pipeline+phone, ручной retry возможен.

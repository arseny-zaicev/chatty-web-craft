# Чтобы такого больше не было: фиксим рассинхрон Inbox-превью

## Что произошло

В списке чатов под "Oscar Velasquez" показывался текст (в момент скриншота - email `Oscar.velasquez@dispapeles.com`, позже - `"Mañana en este horario esta bien"`), которого **физически нет в треде сообщений** этого разговора.

Проверил БД:
- `conversations.last_message_text` = `"Mañana en este horario esta bien"` @ `16:16:41`
- Последнее реальное сообщение в `messages` для этого диалога - `16:13:31`
- Поиск этого текста по всей таблице `messages` - **0 совпадений**

То есть колонка `last_message_text` живёт отдельной жизнью от реальных сообщений.

## Корневая причина

`last_message_text` / `last_message_at` пишутся вручную **в трёх разных местах**, каждое - своим путём, без транзакции с insert в `messages`:

1. `supabase/functions/whatsapp-webhook/index.ts` - 3 точки (входящие: строки 199, 229, 545). Update в `conversations` идёт **до** insert в `messages`, ошибка insert не проверяется.
2. `supabase/functions/send-whatsapp/index.ts:307` - исходящие через UI.
3. Кампании (campaigns / send pipelines) - пишут свой текст шаблона.

Любой сбой между "обновили превью" и "вставили message" (RLS, дубль провайдер-id, ретрай вебхука, отправка на чужой номер, тестовый payload) → превью показывает фантомный текст, которого в треде нет. Точно такая же дыра позволяет показать email-черновик / placeholder / fallback `[text]` без реальной строки.

## План фикса

### 1. Сделать `last_message_text` производным полем (single source of truth)

Миграция:

- Триггер `AFTER INSERT ON public.messages` (и `AFTER UPDATE OF body` на всякий) обновляет родительскую `conversations`:
  - `last_message_text = NEW.body` (или `'[' || media_type || ']'` если body пустой)
  - `last_message_at = NEW.created_at`
  - для inbound: `unread_count = unread_count + 1`, `last_inbound_at = NEW.created_at`
- Триггер `AFTER DELETE ON public.messages` пересчитывает превью из оставшихся сообщений (или ставит NULL).
- Опционально: `REVOKE UPDATE (last_message_text, last_message_at) ON public.conversations FROM authenticated, anon` - чтобы клиент физически не мог писать в эти поля.

### 2. Удалить все ручные апдейты `last_message_text` / `last_message_at`

- `supabase/functions/whatsapp-webhook/index.ts` - убрать поля из 3 update/insert блоков (создание диалога оставляем, но без превью - его проставит триггер первого message).
- `supabase/functions/send-whatsapp/index.ts` - убрать update после insert.
- Проверить campaigns / reply-watchdog / slack-dispatch - не должны писать в эти колонки.

### 3. Не считать диалог "поступившим", пока message не вставлен

В webhook порядок меняем на: **сначала** insert в `messages` (с проверкой ошибки), и только если успешно - триггер сам обновит conversations. Если insert падает → диалог остаётся без фантомного превью + лог ошибки.

### 4. Бэкфилл

Одноразовый UPDATE: для каждого `conversation_id` взять `body` и `created_at` последнего реального сообщения и записать в `last_message_text` / `last_message_at`. Где сообщений нет - выставить NULL. Это сразу очистит существующие фантомы (включая случаи "Mañana...", где-то email и т.п.).

### 5. Защита от регрессий

- DB-инвариант (CHECK или вьюшка-монитор) + edge function `inbox-integrity-check` (раз в час): считает диалоги, у которых `last_message_text` не равен body последнего message. В норме - 0. Шлём в Slack-канал ops при >0.
- Простой unit-тест миграции: insert message → проверка conversations.last_message_text.

## Что НЕ трогаем

- UI инбокса (`src/pages/CRM.tsx:789`) - читает то же поле, после фикса будет всегда корректно.
- `unread_count` логику кампаний/реалтайма - отдельная тема, в этот план не входит.

## Технические детали (для разработчика)

Файлы:
- новая миграция `supabase/migrations/<ts>_conversations_preview_trigger.sql`
- `supabase/functions/whatsapp-webhook/index.ts` (3 места)
- `supabase/functions/send-whatsapp/index.ts` (1 место)
- бэкфилл-SQL разовый в той же миграции
- (опц.) новая edge `supabase/functions/inbox-integrity-check/index.ts` + cron

Псевдо-SQL триггера:

```sql
create or replace function public.tg_conversations_sync_preview()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.conversations
     set last_message_text = coalesce(NEW.body, '[' || coalesce(NEW.media_type,'media') || ']'),
         last_message_at   = NEW.created_at,
         last_inbound_at   = case when NEW.direction='inbound' then NEW.created_at else last_inbound_at end,
         unread_count      = case when NEW.direction='inbound' then coalesce(unread_count,0)+1 else unread_count end
   where id = NEW.conversation_id;
  return NEW;
end$$;
```

После approve - применяю миграцию, чищу edge-функции, запускаю бэкфилл, и фантомы пропадают навсегда.

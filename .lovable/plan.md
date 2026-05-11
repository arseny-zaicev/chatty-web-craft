## Что происходит

В базе данных у `jk4016447`, `sankeetha847`, `Large Media Solution`, `jamalpuri pradeepraj`, `Hitesh` уже стоит `unread_count = 0` - то есть API исправно сбрасывает счётчик. Но UI продолжает показывать значки "2" / "1". Кнопка "прочитано" формально срабатывает (UPDATE доходит до БД), просто визуально ничего не меняется.

Корень проблемы - в `src/pages/CRM.tsx`:

- `markRead` / `markUnread` делают только запрос в Supabase и **не обновляют локальный state**. Они полагаются на realtime-событие `UPDATE conversations`, чтобы перерисовать список.
- При открытии чата (`useEffect` на `activeId`) тоже вызывается `markConversationRead`, и снова без локального обновления.
- Если realtime-событие не дошло (потеря соединения, переподписка после смены `activeId`, RLS-фильтр), бейдж зависает на старом значении до полной перезагрузки страницы.

Плюс отдельная UX-проблема: счётчик **не сбрасывается, когда менеджер отправляет ответ**. Пользователь ответил - чат логически "прочитан", но цифра остаётся, пока он явно не кликнет на бейдж или не откроет диалог.

## Что предлагаю сделать

1. **Оптимистичные обновления в `CRM.tsx`**
   - В `markRead` сразу `setConversations(prev => prev.map(...))` ставим `unread_count: 0`, потом отправляем запрос; если ошибка - откатываем.
   - То же для `markUnread` (`unread_count: Math.max(1, prev)`).
   - В `useEffect` на смену `activeId` локально обнуляем `unread_count` для активного диалога перед/после `markConversationRead`.

2. **Авто-сброс при ответе менеджера** (триггер в БД)
   - Добавить триггер `AFTER INSERT ON public.messages`: если `direction='outbound'` и `sent_by_user_id IS NOT NULL` (то есть ответ человека, не автомат) - `UPDATE conversations SET unread_count = 0 WHERE id = NEW.conversation_id`.
   - Это автоматически снимает бейдж как только манагер отправил сообщение, для всех клиентов сразу через realtime.

3. **Защитная подстраховка для realtime**
   - В обработчике `useRealtimeTable` на `conversations` уже есть merge по `id` - оставляем как есть.
   - Дополнительно: при `markConversationRead` не ждать realtime, локальный state - источник правды до прихода серверного значения (см. п.1).

## Технические детали

Файлы:
- `src/pages/CRM.tsx` - оптимистичные `setConversations` в `markRead`, `markUnread`, и в `useEffect` по `activeId`.
- Миграция БД: новая функция `public.reset_unread_on_manager_reply()` + триггер на `public.messages`.

```sql
CREATE OR REPLACE FUNCTION public.reset_unread_on_manager_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'outbound' AND NEW.sent_by_user_id IS NOT NULL THEN
    UPDATE public.conversations
       SET unread_count = 0
     WHERE id = NEW.conversation_id
       AND unread_count > 0;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER reset_unread_on_manager_reply
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.reset_unread_on_manager_reply();
```

Условие `sent_by_user_id IS NOT NULL` важно - чтобы исходящие из автоматических кампаний/first-touch не сбрасывали счётчик новых входящих, которые пришли уже после рассылки.

## Что НЕ делаю

- Не трогаю `whatsapp-webhook` - там логика инкремента счётчика на входящие правильная.
- Не меняю RLS-политики conversations.
- Не трогаю realtime-публикацию (`conversations` уже в `supabase_realtime`, `replica identity full`).

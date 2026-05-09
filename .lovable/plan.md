# Pipeline ↔ Inbox sync, deal actions, assignee system

## 1. База (migration)

Расширяем `conversations`:
- `assigned_user_id uuid` - ответственный сеттер (постоянная привязка)
- `active_responder_id uuid` - кто прямо сейчас отвечает (presence)
- `active_responder_at timestamptz` - когда последний раз был активен (TTL ~2 минуты)

Backfill: для каждой `conversation` без `deal` вызываем `ensure_deal_for_conversation()`. Триггер уже создаёт deal на новую беседу, так что в будущем это покрыто.

Realtime publication для `conversations` (если ещё нет) - чтобы видеть presence обновления.

## 2. Pipeline карточка (DealCard)

Добавляем на карточку (видно без открытия Sheet):
- Кнопка "Open chat" → ведёт в `/ws/{slug}/inbox?conversation={id}` (если есть)
- Кнопка "Copy phone" → копирует `contact_phone` в clipboard
- Аватар/инициалы assignee в углу

## 3. Pipeline Sheet (Deal details)

Добавляем кнопки в действиях:
- "Open chat" (есть)
- "Copy phone"
- "Copy details" → копирует name+phone+amount+stage+notes как plain-text блок
- Селект "Assigned to" - выбрать сеттера из workspace_members (+ "Unassigned")

## 4. Inbox (CRM)

В шапке открытой беседы:
- "Active: {name}" - кто сейчас в чате (если `active_responder_at` < 2 мин назад и это не я)
- Селект "Assigned to" - смена ответственного

При открытии беседы / отправке сообщения автоматически проставляем `active_responder_id = me, active_responder_at = now()`.

В списке бесед слева:
- Toggle "My chats only" - фильтрует по `assigned_user_id = me`
- Счётчик "Mine: X / All: Y" в шапке

## 5. Pipeline списка

- Toggle "My chats only" в шапке Pipeline (тот же фильтр).
- Все беседы теперь имеют deal → колонки покажут реальный поток.

## 6. Технические детали

- `assigned_user_id` хранится на `conversations` (источник правды) - `deals.user_id` остаётся владельцем записи. Pipeline показывает `deal.conversation.assigned_user_id`.
- Members для селекта тащим из `workspace_members` + `profiles.full_name` (fallback на email из auth - но т.к. emails в auth не доступны клиенту, добавим `display_name` через профиль или просто email хранить в `workspace_members`). Вариант проще: храним `display_name` прямо в `workspace_members` через join с `profiles`, а если нет имени - покажем "User abc12345".
- RLS: всё это видят те же роли (workspace_member). Update assignee может только manager+ или сам себе (для самопринятия).

## Файлы

- `supabase/migrations/...` - новые колонки + backfill + realtime
- `src/lib/conversations.ts` - helpers (assignConversation, claimResponder)
- `src/lib/workspaceMembers.ts` - useWorkspaceMembers hook
- `src/components/workspace/AssigneeSelect.tsx` - переиспользуемый селект
- `src/pages/Pipeline.tsx` - кнопки на карточке + sheet + filter
- `src/pages/CRM.tsx` - active responder + assignee + filter
- `src/lib/crmData.ts` - расширить типы Deal/Conversation
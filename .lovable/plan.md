
## Что уже есть в БД (хорошие новости)

- `conversations.assigned_user_id`, `assigned_at`, `active_responder_id`
- `conversations.first_human_reply_at`, `last_human_reply_at`, `waiting_since`, `last_inbound_at`
- Триггер `touch_conversation_reply_timing` уже считает все эти тайминги при каждом сообщении
- RPC `ops_operator_performance(_from, _to)` уже возвращает median first response, median reply time, активные/назначенные чаты, конверсии в meeting и т.д. (но `admin only`)
- `workspace_members` + `is_workspace_manager()` для прав

Значит, костяк готов — нужно только расширить роли, поправить RPC под workspace и собрать UI.

---

## 1. Сеттеры — модель (и user-сеттеры, и внешние метки)

- Новая enum-роль `setter` в `app_role` (если ещё нет — добавить).
- Новая таблица `workspace_setters` — для внешних людей без логина:
  - `id`, `workspace_id`, `display_name`, `avatar_url`, `external` (bool), `linked_user_id` nullable, `is_active`
  - Если `linked_user_id` есть → это участник workspace; если нет → просто метка
- На `conversations` добавить `assigned_setter_id uuid` (ссылка на `workspace_setters.id`). Старый `assigned_user_id` остаётся для обратной совместимости и автозаполняется из `linked_user_id`.
- Триггер: при `INSERT/UPDATE` assigned_setter_id → подставлять `assigned_user_id`, ставить `assigned_at = now()`.

## 2. Назначение в Inbox (ручное)

- В заголовке открытого чата — поповер «Assign to» со списком активных сеттеров workspace, поиск, аватары, очистка.
- Записывает в `conversations.assigned_setter_id`.
- В карточке чата в списке — маленький аватар назначенного сеттера справа.

## 3. Фильтры по сеттеру

- В Inbox-баре фильтров (рядом с All pipelines / All numbers) — новый селект **Assignee**: «Все», «Не назначены», список сеттеров, «Только мои» (если текущий user — сеттер).
- В Pipeline-вью — такой же селект над колонками; фильтрует deals по `conversation.assigned_setter_id`.
- В обоих местах счётчики (Unread, Replied, Negative) пересчитываются по выбранному сеттеру.

## 4. Управление сеттерами

- В Settings → Team новый раздел **Setters**:
  - Список с avatar + name + статус (Active / Paused) + чьи чаты ведёт (счётчик)
  - «Add setter» → выбрать из workspace members **или** ввести имя вручную (external)
  - Toggle active/paused, edit, remove
- Доступно только manager/owner workspace.

## 5. Stats-таб

Новый пункт сайдбара воркспейса — **Stats**. Открывается всем участникам workspace, но данные показываются по правилам:

- **Toggle сверху**: `Me` (мои метрики) / `Team` (все сеттеры).
  - `Team` доступен только manager/owner; обычный сеттер этот переключатель не видит.
- **Time range**: Last 24h / 7d / 30d / Custom (default 7d, Dubai tz).
- **Pipeline filter**: All / конкретный пайплайн.

### Метрики (на сеттера и в сумме):

1. **Active chats** — конверсии где `assigned_setter_id = X` и стадия `open`
2. **Avg first response time** — медиана/среднее (`first_human_reply_at − first inbound`) для чатов сеттера в окне
3. **Avg reply time in dialog** — медиана (`outbound human − предшествующий inbound`) по всем парам в окне
4. **Stage conversions** — сколько лидов сеттер довёл до Booked / Showed / Closed (берём из истории `deals` + текущей стадии)

Плюс таблица «Per setter» с этими 4 колонками + сортировка.

### Технически:

- Новый RPC `setter_performance(_workspace_id, _from, _to, _pipeline_id, _setter_id)`:
  - SECURITY DEFINER
  - Если `_setter_id` указан → проверяем, что caller это либо сам сеттер (по `linked_user_id`), либо `is_workspace_manager`
  - Если NULL → только manager/owner
  - Использует ту же логику что `ops_operator_performance`, но с фильтром по workspace и `assigned_setter_id`

### Share

Для v1 — никакого публичного токена. Сеттер логинится в свой workspace и видит **только** свои цифры; manager видит всех. Это закрывает запрос «я могу выбрать — он видит только своё или всё».
(Публичный share-link можно добавить позже отдельной задачей.)

---

## Файлы

**Миграция:**
- `workspace_setters` table + RLS
- `conversations.assigned_setter_id` + триггер sync с `assigned_user_id`
- `setter_performance(...)` RPC

**Backend:** edge-функции не нужны — всё через RPC.

**Frontend (новое/правки):**
- `src/components/workspace/AssigneeFilter.tsx` — переиспользуемый селект (Inbox + Pipeline)
- `src/components/workspace/AssignSetterPopover.tsx` — назначение в чате
- `src/components/workspace/SettersSettings.tsx` — управление в Settings → Team
- `src/pages/workspace/WorkspaceStats.tsx` — новая страница Stats
- `src/lib/setters.ts` — fetch/mutate helpers
- Правки: `WorkspaceSidebar.tsx` (новый пункт Stats), `Pipeline.tsx`, `WorkspaceOverview.tsx`/Inbox, `src/lib/inbox.ts` (фильтр по сеттеру в запросе)

---

## Что НЕ делаем в этом круге

- Авто round-robin распределение
- Авто-назначение по стадии
- Публичная share-ссылка на Stats без логина
- SLA / алерты по медленным сеттерам

Если ок — пишу миграцию и код за раз.

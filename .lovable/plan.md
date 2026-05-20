## Цель

В composer'е чата (CRM Inbox) добавить секцию **Templates** в Library popover - там только ты (global admin) можешь привязать утверждённые Meta-шаблоны / группы шаблонов. Цель - быстро открывать переписку после 24h окна, не рискуя отправить шаблон, не принадлежащий тому номеру, с которого идёт чат.

Ключевое: setter жмёт **одну кнопку** (например "Re-engage"), а система сама подбирает вариант шаблона под `conversation.whatsapp_number_id`. Если для этого номера в группе нет варианта - кнопка для этого чата неактивна с понятным tooltip.

---

## Что уже есть (не строим заново)

- `template_groups` - таблица уже существует, и `TemplateGroupsDialog` умеет создавать/редактировать группы (имя + категория + список template names).
- `groupLogicalTemplates()` в `src/lib/launchData.ts` строит `LogicalTemplate` с готовым `variantByNumber: Map<whatsapp_number_id, Template>` - то самое авто-определение, которое нужно. Используем без изменений.
- `postGupshupTemplate` + `sendTemplate` + `buildTemplateParams` (из `_shared/template.ts`) - проверенный путь отправки template-message через Gupshup, сейчас живёт в `campaigns/index.ts`.
- `ComposerInsertButton` (Library popover) и `CRM.tsx` `handleSend` - точка интеграции.

---

## Что строим

### 1. БД (миграция)

Новая таблица `workspace_quick_template_groups` (admin-curated list - какие группы шаблонов показывать как quick reply в каком workspace, и в каком порядке):

- `id`, `workspace_id`, `template_group_id` (FK на `template_groups.id`)
- `label` (override - короткое имя кнопки, напр. "Re-engage")
- `position int`, `created_by`, `created_at`
- UNIQUE `(workspace_id, template_group_id)`

RLS:
- SELECT: любой `is_workspace_member(workspace_id, auth.uid())` - чтобы все сеттеры видели кнопки
- INSERT/UPDATE/DELETE: только `is_admin(auth.uid())` (глобальный админ из `user_roles`) - никто кроме тебя не может менять список

Зачем отдельная таблица, а не флаг на `template_groups`: `template_groups` уже используется в Launch Wizard и не должна засоряться "только-для-инбокса" логикой. Эта таблица - чисто "белый список quick replies".

### 2. Edge function: `send-whatsapp-template`

Новая функция (рядом с `send-whatsapp`). Body: `{ conversation_id, template_group_id, variables? }`.

Логика:
1. Грузим conversation -> `workspace_id`, `whatsapp_number_id`, `contact_phone`, `contact_name`.
2. Проверяем что user - workspace member.
3. Проверяем что `(workspace_id, template_group_id)` есть в `workspace_quick_template_groups`. Иначе 403.
4. Грузим все `message_templates` где `name IN (template_groups.template_names)` AND `workspace_id = X` AND `status = 'approved'`.
5. Находим вариант где `whatsapp_number_id = conversation.whatsapp_number_id`. **Если не нашли - 400 с понятной ошибкой** ("No approved variant of group X for this number").
6. Грузим `whatsapp_numbers` row для api key / app id / source / display_name.
7. Дефолтные переменные: `{1}` = `contact_name || "there"` (используем `buildTemplateParams` из `_shared/template.ts` - та же fallback-логика что в кампаниях).
8. Дёргаем `postGupshupTemplate` (логику копируем из `campaigns/index.ts` в `_shared/gupshup_send.ts` чтобы не дублировать; `campaigns/index.ts` тоже на неё переключаем).
9. На успех - вставляем `messages` row (direction=outbound, body=rendered template body через `renderTemplateBody`, status=sent, provider_message_id) и обновляем `conversations.last_message_*`, как делает send-whatsapp. Это критично - без этого setter не увидит что отправил.
10. Возвращаем `{ ok, message_id, debug }`.

### 3. UI

**3a. Admin-only страница** "Quick reply templates" - под `/workspace/:slug/settings` (или в `WorkspaceSettings`, в новой вкладке "Templates quick replies"). Видна и редактируется только если `useWorkspaceRole().isAdmin === true`.

Содержит:
- Список текущих quick template groups (drag-to-reorder, удалить)
- Кнопка "Add group" -> select из `template_groups` этого workspace
- Поле "Button label" (override)
- Под каждой группой - mini-grid: для каждого активного `whatsapp_number` показываем "covered" (зелёная галочка с именем шаблона) / "missing" (красный warning). Так ты сразу видишь, на каком номере вариант не подцеплен. Использует `groupLogicalTemplates().variantByNumber`.

**3b. Composer integration** в `CRM.tsx`:

Рядом с `ComposerInsertButton` добавляем новую кнопку **"Templates"** (открывается только если в workspace есть хоть одна quick group). Popover показывает список quick groups. Для текущего чата:
- если `variantByNumber.has(conversation.whatsapp_number_id)` - кнопка активна, на hover показывает preview rendered body (через `renderTemplateBody` с `contact_name`).
- иначе - disabled с tooltip "No approved variant for this number"

Клик -> вызывает `send-whatsapp-template` edge function -> на успех toast + сообщение сразу появляется в чате (realtime channel уже подписан).

Никакого ввода переменных в первой версии - только `{1}=contact_name`. Если у шаблона >1 переменной и нет defaults - кнопка disabled с тултипом "Template has variables - not supported yet".

### 4. Авто-определение, о котором ты спрашивал

Делаем именно так как ты предложил: одна логическая группа -> много вариантов под разные номера -> при клике выбирается вариант чей `whatsapp_number_id` == `conversation.whatsapp_number_id`. Это исключает риск отправить чужой шаблон. Логика уже реализована в `groupLogicalTemplates()` и переиспользуется и в UI (показ доступности) и в edge function (фактический выбор).

---

## Порядок реализации

1. Миграция `workspace_quick_template_groups` + RLS.
2. Вынести `postGupshupTemplate` в `_shared/gupshup_send.ts`; `campaigns/index.ts` подключить оттуда (нулевые изменения поведения).
3. Edge function `send-whatsapp-template`.
4. Admin UI в `WorkspaceSettings` - вкладка "Quick reply templates" + coverage matrix.
5. Кнопка "Templates" в composer (`CRM.tsx`) рядом с Library.
6. Smoke test на реальном чате (Goflow / любой активный workspace).

---

## Открытые вопросы перед реализацией

1. **Где разместить admin UI** - отдельная вкладка в `WorkspaceSettings` или новый пункт в WorkspaceSidebar "Quick replies"? (рекомендую вкладка в Settings - меньше шума).
2. **Кто видит кнопку Templates в composer** - все сеттеры или тоже только админ? (логика "сеттеры видят, ты курируешь" - кажется правильной, но подтверди).
3. **Переменные шаблона**: ок ли на первой версии ограничиться `{1}=contact_name` и блокировать многопеременные шаблоны? Или нужно сразу окно ввода переменных?

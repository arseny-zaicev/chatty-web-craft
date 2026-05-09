# Client Portal Access - Implementation Plan

## Goal

Дать возможность приглашать сотрудников клиентов в конкретные воркспейсы (Company15, и любые новые). Они логинятся, видят **только** свой воркспейс, и **только** разрешённые разделы: Overview, Inbox, Pipeline, Campaigns. Скрываем технические детали: app name, имя/тело шаблона, provider IDs.

---

## Phase 1 - Backend: roles & access

**1.1 Роль `client` в `workspace_members`**
- Используем существующую таблицу `workspace_members` (поле `role text`).
- Зафиксируем 2 роли: `manager` (полный доступ) и `client` (ограниченный просмотр).
- Дополним RLS только там, где нужно: `whatsapp_numbers`, `message_templates` - для роли `client` запрещаем чтение (они и так по `is_workspace_member` сейчас видят, нужно сузить через новую функцию `is_workspace_manager`).

**1.2 Новая SQL-функция**
```sql
is_workspace_manager(_workspace_id, _user_id) -- admin OR owner OR member.role = 'manager'
```
Подменим `is_workspace_member` на `is_workspace_manager` в SELECT-политиках для:
- `whatsapp_numbers`
- `message_templates`
- `workspace_library_fields`
- `workspace_saved_replies`

Оставляем `is_workspace_member` для: `conversations`, `messages`, `campaigns`, `campaign_recipients`, `deals`, `pipeline_stages` (эти нужны клиенту).

**1.3 Edge function `invite-workspace-member`**
- Вход: `{ workspace_id, email, role }`. Проверяет, что вызывающий - admin или owner воркспейса.
- Создаёт пользователя через service role (`admin.createUser` с временным паролем + `inviteUserByEmail` для отправки письма) **или** возвращает ошибку, если email уже зарегистрирован - тогда просто добавляем `workspace_members`.
- Записывает строку в `workspace_members`.

---

## Phase 2 - Admin/Workspace UI: members management

**2.1 Раздел "Team" в Workspace Settings (`/ws/:slug/settings`)**
- Список текущих членов (email, роль, дата добавления).
- Кнопка "Invite member" - модалка: email + select роль (Manager / Client).
- Кнопка удалить (только для admin/owner).

**2.2 В админке `/admin` карточки клиента**
- Маленький бейдж "N members" со ссылкой на settings.

---

## Phase 3 - Client login flow

**3.1 Новая страница `/portal-auth`** (отдельная от `/admin-auth` и старой `/client-auth`, которую трогать не будем - она для Google Sheets портала).
- Email/password форма + "Forgot password" → `/reset-password`.
- После логина: запрос `workspace_members` для текущего юзера. Если есть запись - редирект на `/ws/{slug}/overview`. Если нет - "No access yet, ask your account manager".

**3.2 Страница `/reset-password`** - стандартная (есть в инструкциях).

**3.3 `WorkspaceLayout` гард**
- Сейчас пускает только `arseny@iskra.ae`. Меняем: пропускаем admin **или** членов воркспейса (по `workspace_members`). Не-членов - кикаем на `/portal-auth`.

---

## Phase 4 - Restricted UI for `role=client`

**4.1 Хук `useWorkspaceRole(workspaceId)`** - возвращает `'admin' | 'manager' | 'client'`. Кэшируется в react-query.

**4.2 Sidebar (`WorkspaceSidebar.tsx`)**
- Для `client`: показываем только Overview, Inbox, Pipeline, Campaigns. Скрываем Library, Launch, Settings.
- Список клиентов в верхней секции - тоже фильтруем (показываем только те воркспейсы, где он состоит).

**4.3 Inbox**
- В шапке чата и списке: убрать "via {whatsapp_number.display_name / app_id}". Оставить только номер телефона контакта и имя контакта.
- Скрыть "sender number" в metadata.

**4.4 Campaigns**
- Скрыть колонки/поля: template name, template body preview, app/number ID.
- Оставить: Campaign name (то, что мы вводим при запуске), статус, дата, прогресс (sent/total/replies).

**4.5 Overview & Pipeline**
- Overview: убрать секции с numbers health и templates - оставить KPIs и recent launches (без template name).
- Pipeline: оставить как есть (там нет технических деталей).

**4.6 Роуты-защитники**
- `/ws/:slug/library`, `/ws/:slug/settings`, `/ws/:slug/launch` - для `client` редирект на `/ws/:slug/overview`.

---

## Phase 5 - Polish

- Бейдж "Client view" в верхнем хедере, чтобы было понятно, что это ограниченная сессия.
- "Sign out" в хедере.
- В админке кнопка "Open as client" (preview-режим - опционально, могу пропустить).

---

## Execution order (последовательно)

1. **Migration**: `is_workspace_manager` + обновлённые RLS политики.
2. **Edge function**: `invite-workspace-member`.
3. **Settings → Team UI** + интеграция с edge function.
4. **`/portal-auth`** + `/reset-password` страницы.
5. **WorkspaceLayout гард** - пускать членов воркспейса.
6. **`useWorkspaceRole` + Sidebar/route фильтры**.
7. **UI sanitization**: Inbox, Campaigns, Overview.
8. **Бейдж "Client view"** + sign out.

После каждого шага - проверяю, что admin (`arseny@iskra.ae`) ничего не потерял.

---

## Open questions (одобри/поправь перед стартом)

1. **Способ приглашения**: отправлять magic-link письмо (Supabase invite email) или давать админу временный пароль показать клиенту вручную? (рекомендую magic-link).
2. **В Campaigns**: показывать клиенту **тело сообщения** в отчёте или вообще скрыть превью? (Сейчас план - скрыть полностью).
3. **Inbox**: показывать клиенту исходящее тело сообщения (то, что мы написали) или только статус "Outbound message"? (Рекомендую показывать тело - иначе бесполезно).
4. **Pipeline**: клиент может **двигать** карточки между стадиями или только смотреть? (Рекомендую: двигать может, чтобы вести лидов).

Подтверди ответы (или скажи "по умолчанию"), и я начинаю с Phase 1.
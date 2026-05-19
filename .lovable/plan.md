
# План: расширяемые автоматизации стадий

## Что есть сейчас
В `Stage automations` диалоге (иконка молнии в Pipeline) уже работают 4 триггера: `button_click`, `inbound_keyword`, `inbound_any`, `follow_up_sent`. Они применяются в `whatsapp-webhook` (при входящем) и `follow-up-dispatch` (при отправке follow-up). Логика — pure text matching, без AI.

То есть для кейса "любой ответ → стадия Replied" уже есть триггер `Any inbound reply` — нужно просто его добавить. Но не хватает двух важных классов:

1. **Time-based** — "N часов без ответа лида → No reply"
2. **Assignment** — "оператор закрепил чат за собой → перенести в стадию"

И всё это должно быть настраиваемо из UI.

---

## Что добавляем

### 1. Новые типы триггеров (DB enum + UI)

| Триггер | Когда срабатывает | Параметры |
|---|---|---|
| `time_no_inbound` | прошло X минут с последнего исходящего, а входящего так и нет | delay_minutes, опц. source_stage_id |
| `time_in_stage` | карточка висит в стадии X дольше Y минут (без условий на сообщения) | delay_minutes, source_stage_id |
| `conversation_assigned` | у чата появился `assigned_user_id` (любой сеттер) | опц. source_stage_id |
| `conversation_claimed_self` | сеттер сам себя поставил (assigned_user_id = тот, кто менял) | опц. source_stage_id |

Существующие триггеры остаются как есть.

Плюс ко всем триггерам — необязательный фильтр `source_stage_id`: "правило срабатывает только если карточка сейчас в этой стадии". Это даёт каскад: "Leads sent → 8h без ответа → No reply", "No reply → 24h без ответа → Disqualified", и т.д.

### 2. Изменения в БД

```sql
-- Расширяем enum
ALTER TYPE automation_trigger ADD VALUE 'time_no_inbound';
ALTER TYPE automation_trigger ADD VALUE 'time_in_stage';
ALTER TYPE automation_trigger ADD VALUE 'conversation_assigned';
ALTER TYPE automation_trigger ADD VALUE 'conversation_claimed_self';

ALTER TABLE stage_automations
  ADD COLUMN delay_minutes integer,
  ADD COLUMN source_stage_id uuid REFERENCES pipeline_stages(id) ON DELETE CASCADE;
```

`trigger_value` оставляем для совместимости (keywords/button text). Новые поля используются только для новых триггеров.

### 3. Новая edge function: `automation-time-watchdog`

Запускается по cron каждые 5 минут. Один проход:

- Берёт все активные правила с триггером `time_no_inbound` или `time_in_stage`.
- Для каждого правила джойнит `deals` + `conversations` в нужном pipeline:
  - **time_no_inbound**: `deal.stage_id = source_stage_id` (если задана), `conversations.last_inbound_at IS NULL OR last_inbound_at < last_outbound_at`, и с момента последнего исходящего (или из messages MAX(created_at где direction='outbound')) прошло >= delay_minutes.
  - **time_in_stage**: `deal.stage_id = source_stage_id`, `deal.updated_at < now() - delay_minutes`.
- Двигает `deals.stage_id` → `target_stage_id`. Идемпотентно (после переноса условия уже не выполнятся).
- Лимит 500 карточек за проход, чтобы не задерживать cron.

Cron job (через `supabase/insert`, не миграция — содержит anon key):
```sql
SELECT cron.schedule(
  'automation-time-watchdog-every-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(url:='...automation-time-watchdog', headers:='...', body:='{}')$$
);
```

### 4. Триггер на назначение чата

DB trigger на `conversations` AFTER UPDATE OF `assigned_user_id`: если новое значение не NULL и отличается от старого — вызвать `apply_assignment_automations(conversation_id, assigned_user_id, prev_user_id)`.

Функция (security definer):
- Берёт `deals.stage_id` и `pipeline_id` по `conversation_id`.
- Ищет активные правила `conversation_assigned` / `conversation_claimed_self` для этого `pipeline_id`, где `source_stage_id IS NULL` или равно текущему стейджу.
- Для `conversation_claimed_self` — проверяет, что назначающий = назначаемый (передаём `auth.uid()` из триггера; для серверных апдейтов триггер игнорируется).
- Двигает `deals.stage_id` → `target_stage_id`.

Это даёт мгновенную реакцию без cron.

### 5. UI: StageAutomationsDialog

Расширяем существующий диалог (`src/components/workspace/StageAutomationsDialog.tsx`):

- В `<Select>` триггера добавляем 4 новых пункта с русскими/EN лейблами.
- Условный рендеринг доп. полей:
  - Time-based → `<Input type="number">` для часов/минут + dropdown единицы + опц. `Source stage` selector.
  - Assignment → опц. `Source stage` selector + чекбокс "Only when claimed by self".
- В списке существующих правил — показываем в человекочитаемом виде: "После 8h без ответа в `Leads sent` → `No reply`", "Чат назначен (в любой стадии) → `Aktive Chats`".

Презеты быстрые добавляем:
- "8h no reply → No reply" (если такая стадия есть в pipeline)
- "Assigned → Active chats" (если такая стадия есть)

---

## Технические детали

**Файлы:**
- Миграция: новые enum values, колонки, DB trigger + функция, RLS не меняем.
- Insert (не миграция): cron job для watchdog.
- `supabase/functions/automation-time-watchdog/index.ts` (новая).
- `supabase/functions/whatsapp-webhook/index.ts` — не трогаем (inbound_any уже есть).
- `src/components/workspace/StageAutomationsDialog.tsx` — расширяем форму и рендер списка.

**Edge cases:**
- Idempotency: после переноса карточки условие уже не выполняется (стадия поменялась), повторно не двинет.
- Cross-pipeline target: используем тот же `resolveTargetStage` подход что в whatsapp-webhook (имя/stage_type fallback). Для time-watchdog это менее критично — обычно правила pipeline-scoped.
- Не двигаем карточки из won/lost стейджей — это терминальные.
- `time_no_inbound` нужно last_outbound. Если в `conversations` нет такого поля — считаем по `MAX(messages.created_at) WHERE direction='outbound'` (один LATERAL JOIN, индекс по `(conversation_id, direction, created_at desc)` уже есть).

**Безопасность:**
- DB trigger на conversations выполняется в контексте пользователя — `claimed_self` детектируется через `auth.uid()`.
- Watchdog edge function использует service role и сама проверяет workspace scope каждого правила.

---

## Что увидит пользователь

В диалоге `Stage automations` появятся новые типы триггеров — он сам сможет собирать сценарии вида:

- "Любой ответ → Replied" (уже доступно сегодня — `Any inbound reply`)
- "8 часов без ответа из `Leads sent` → `No reply`"
- "Закрепил за собой чат → `Aktive Chats Dencas`"
- "24 часа в `No reply` → `Disqualifiziert`"

Без кода, без поддержки.

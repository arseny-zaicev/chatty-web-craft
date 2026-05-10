## Цель

Добавить в Operations отдельный реестр **Business Managers** с трекингом прогрева, чтобы видеть статус прогрева на уровне BM (а не только отдельных номеров) и какие номера к каждому BM привязаны.

## Где это живёт

Новая страница `/admin/fleet/business-managers` рядом с `FleetRegistry` и `FleetAnalytics`. Точка входа - таб "Business Managers" в навигации Operations / Fleet.

## Модель данных

Новая таблица `business_managers`:
- `name` (уникальное в рамках workspace, например "BM-Iskra-01")
- `provider` (gupshup / meta / other)
- `external_id` (Meta BM ID)
- `owner_email`, `notes`
- `status`: `warming` / `active` / `paused` / `restricted` / `blocked` / `retired`
- `warmup_started_at`, `warmup_target_date`, `warmup_stage` (day 1-30 / week 1-4 / "ready")
- `last_warmup_action_at` (последнее действие, движущее прогрев - sent campaign, manual ping)
- `daily_warmup_cap`, `current_day_sent` (для оркестратора)
- `health_score` 0-100 (агрегат от номеров)
- `workspace_id`, `created_by`, timestamps

Связь с номерами: добавить `business_manager_id uuid` в `whatsapp_numbers` (мягкая ссылка). Старое текстовое поле `bm_name` оставляем как fallback и для миграции - скрипт смэтчит по имени.

Лог событий прогрева `business_manager_warmup_events`:
- `business_manager_id`, `event_type` (`campaign_sent`, `number_added`, `number_restricted`, `manual_note`, `stage_advanced`), `payload jsonb`, `created_by`, `created_at`.
Используется для таймлайна "когда был последний прогрев" и аудита.

RLS: `is_workspace_manager` для записи, `is_workspace_member` для чтения. Admin видит всё.

## UI

### Список BM (`/admin/fleet/business-managers`)
Таблица:
- Имя BM, провайдер, статус (бейдж), стадия прогрева (Day 7/30), health, число номеров (active / restricted / blocked), последнее действие прогрева, владелец.
- Фильтры: статус, провайдер, workspace.
- Поиск по имени / external_id.
- Кнопка "Add BM".

### Детальная страница BM (`/admin/fleet/business-managers/:id`)
Секции:
1. **Header** - имя, статус, стадия, health, кнопки `Advance stage`, `Pause`, `Mark active`, `Retire`.
2. **Warmup plan** - прогресс-бар по дням, цель, daily cap, сколько отправлено сегодня (сумма по номерам).
3. **Allocated numbers** - список `whatsapp_numbers`, привязанных к BM: телефон, статус, messaging_limit, sent today, последнее сообщение. Кнопки `Attach number` / `Detach`.
4. **Timeline** - события из `business_manager_warmup_events` + автоматические события из `slack_event_queue` (number_restricted, number_blocked) отфильтрованные по принадлежности к BM.
5. **Notes**.

### Интеграция с FleetRegistry
В `NumbersInventory` / `FleetRegistry` поле `bm_name` заменить на селект `business_manager_id` (с возможностью создать BM на лету). Колонка "BM" становится ссылкой на детальную BM.

### Интеграция с FleetAnalytics
Добавить агрегаты по BM: средний health, % restricted, send volume per BM за период.

## Логика прогрева (минимальная, без авто-оркестрации)

На этом этапе не строим автопрогрев. Только трекинг:
- `current_day_sent` обновляется триггером/edge-функцией при инсерте `messages` outbound с номеров этого BM.
- `health_score` пересчитывается раз в час cron-функцией: формула из доли active vs restricted/blocked номеров и тренда messaging_limit.
- При переходе номера в `restricted`/`blocked` автоматически пишется событие в timeline BM и статус BM поднимается до `restricted`, если >= N% номеров деградировали (порог настраиваемый, по умолчанию 30%).

Это даёт основу под будущий warmup-orchestrator (P2).

## Slack

Новые события:
- `bm.warmup_started`, `bm.stage_advanced`, `bm.degraded` (при пороге restricted), `bm.ready` (когда прогрев завершён).
Канал - `SLACK_OPS_NUMBERS_CHANNEL_ID` (уже есть).

## Миграция существующих данных

Скрипт (через `supabase--insert`):
1. Сгруппировать `whatsapp_numbers.bm_name` -> создать запись в `business_managers` для каждого уникального непустого имени.
2. Проставить `whatsapp_numbers.business_manager_id`.
3. Статус каждого BM выставить на основании статусов номеров (active если все active, restricted если есть restricted, и т.д.).

## Объём по этапам

**P0 (сейчас)**
- Таблицы `business_managers`, `business_manager_warmup_events`, FK на `whatsapp_numbers`.
- Миграция данных из `bm_name`.
- Страница списка + детальная + ручное управление статусом и стадией.
- Замена `bm_name` инпута на селект BM в Numbers Inventory.

**P1**
- Авто health_score + cron.
- Slack-события прогрева.
- Виджет "BM warmup" на Ops Live.

**P2**
- Warmup-orchestrator: автоматическая отправка warmup-кампаний по плану дней.
- Шаблоны warmup-сообщений на уровне BM.
- Привязка кампаний к BM (а не только к отдельным номерам).

## Технические детали

- Триггер `propagate_number_status_to_bm` пересчитывает агрегаты при апдейте `whatsapp_numbers`.
- Edge function `bm-health-recalc` (cron каждый час) - пересчёт health и `last_warmup_action_at`.
- В `FleetRegistry` добавить колонку BM с навигацией.
- Типы Supabase обновятся автоматически после миграции.

## Открытые вопросы

1. Прогрев привязан к workspace или глобальный для всего Iskra? (по структуре `whatsapp_numbers` они уже workspace-scoped, предлагаю BM тоже workspace-scoped).
2. Нужен ли warmup-плейбук (шаги по дням с целевым кол-вом сообщений), или пока хватит ручного advance stage?
3. Health-score формула - оставить мою дефолтную или есть конкретные веса от тебя?

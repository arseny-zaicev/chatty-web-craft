## Что строим

Большой блок: **Smart Scheduling + Notifications + Roadmap**. Разбиваю на 4 этапа, каждый можно мерджить отдельно.

---

### Этап 1 - Scheduling UI + дни запуска

В Launch Wizard добавляю секцию **Schedule**:
- **Старт:** "Сейчас" / "Запланировать"
- **Дни запуска:** мульти-выбор дней (можно несколько дат, не только одна) - кампания дробится на под-кампании по дням
- **Окно отправки:** `from` - `to` (default 09:00-18:00), с возможностью сдвинуть до 22:00
- **Часовой пояс получателя:** toggle "respect recipient timezone" (определяется по префиксу телефона через `geoFromPhone` + map страна→TZ)
- Превью: "200 сообщений будут отправлены 12 May с 09:00 до 18:00 по локальному TZ получателя"

DB: добавляю в `campaigns`:
- `schedule_window_start time` (default 09:00)
- `schedule_window_end time` (default 18:00)
- `respect_recipient_tz boolean` (default true)
- `scheduled_dates date[]` (массив дат для multi-day запуска)

---

### Этап 2 - Poisson scheduler (backend)

Меняю логику в `send-whatsapp` / `campaigns` edge функции.

Вместо равномерных `delay_min/delay_max` между сообщениями:
1. На момент старта кампании (или cron-тика) - **раз** генерируем `scheduled_at` для каждого `campaign_recipient`:
   - Внутри окна `[window_start, window_end]` в TZ получателя
   - Распределение **Poisson** (экспоненциальные интервалы, не равномерные) - выглядит как естественный человеческий паттерн
   - **Шаффл по номерам:** не "сначала все с номера A, потом B", а перемешать так, чтобы в любую секунду слали 1-2 разных номера (round-robin внутри отсортированной по времени очереди)
2. Cron каждую минуту берёт `campaign_recipients` где `scheduled_at <= now()` и `status='pending'` и шлёт.

Технически - Postgres функция `schedule_campaign_recipients(campaign_id)` + edge cron каждую минуту.

---

### Этап 3 - Slack + Google Calendar notifications

**Slack:**
- Connector уже подключён (`SLACK_API_KEY` в secrets)
- На событие `campaign launched` - сообщение в канал (default `#campaigns` или настраиваемый)
- На завершение кампании - сообщение со stats (sent / failed / read rate если есть)
- Настройка канала: в Workspace Settings новое поле "Slack channel for campaign notifications" + кнопка "Test message"
- Для будущих клиентов - в Settings можно будет добавить `client_slack_channel` (но пока пусто)

**Google Calendar:**
- Нужно подключить Google Calendar connector (попрошу одобрить)
- На запуск - создаю event на дату запуска, `transparency=transparent` (без busy)
- Title: `[Iskra] Launch: {campaign_name}` + описание со ссылкой на dashboard

---

### Этап 4 - Roadmap / Vision page

Новая страница `/ws/:slug/roadmap` (только admin), без публичного доступа:
- Колонки kanban: **Idea / Planned / In Progress / Shipped**
- Каждая карточка: title, description, tags (scheduling/notifications/ai/etc), priority, "why" поле
- DB: таблица `roadmap_items` (workspace-scoped, RLS - только admin/owner)
- Можно добавлять, перетаскивать между колонками, помечать shipped
- На входе засеваю всё что обсуждали в чате (smart routing, A/B copy, stats page, slack reports, calendar, и т.д.)

---

## Технический раздел

**Миграции:**
1. `campaigns` + поля schedule
2. `campaign_recipients.scheduled_at` уже есть
3. Новая таблица `roadmap_items (id, workspace_id, title, description, status, tags[], priority, why, position, created_at)`
4. Опционально: `workspaces.slack_channel_id`, `workspaces.gcal_calendar_id`

**Edge functions:**
- `schedule-campaign` (новая) - генерит `scheduled_at` по Poisson
- `process-campaign-queue` (новая, cron 1 min) - шлёт всё что `scheduled_at <= now()`
- `notify-slack` хелпер (использует `_shared/slack.ts` который уже есть)
- `notify-gcal` (новая, после connect Google Calendar)

**Frontend:**
- `LaunchWizard`: новая секция Schedule
- `WorkspaceSettings`: поле Slack channel + test
- `pages/workspace/Roadmap.tsx` (новая)
- роут `/ws/:slug/roadmap` в `App.tsx`

---

## Порядок ship

1. **Roadmap страница** (быстро, изолировано, сразу даст тебе место копить идеи) - 1 итерация
2. **Scheduling UI + DB поля + дни запуска** - 1 итерация
3. **Poisson scheduler backend + cron** - 1 итерация (требует тестов)
4. **Slack notifications** (campaign launched + completed) - 1 итерация
5. **Google Calendar** (после connect) - 1 итерация

---

## Что нужно от тебя

1. **Стартуем с Roadmap** (быстрая победа + ты сразу засыпешь идеи), потом Scheduling? Или сначала Scheduling раз он критичнее для запусков?
2. **Slack канал** - название канала (например `#iskra-campaigns`)? Создам код на отправку в этот канал, ты его подтвердишь.
3. **Google Calendar** - подтверждаешь подключение connector'а? (попрошу авторизацию через Google)
4. **Multi-day:** если ты выбрал 2 даты для одной аудитории в 200 контактов - делим 100/100 или дублируем 200/200? (думаю делим - дубликаты = бан)

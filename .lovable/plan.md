## Цель

Добавить полноценную аналитику доставки и выручки в Fleet Analytics (admin) — capacity vs sent vs delivered vs failed по номерам, по клиентам, и денежная выручка по ставке за доставленное сообщение (per workspace).

---

## 1. Schema changes

**`workspaces.delivered_rate_usd numeric DEFAULT 0`** — ставка $ за одно delivered сообщение для данного клиента. Редактируется в Admin → Clients (NewClientDialog / клиент-карточка).

Глобальный baseline cap = 200/номер/день — константа `DAILY_CAP_PER_NUMBER = 200` в коде. Заблокированные номера (`status IN ('blocked','restricted')`) исключаются из capacity.

---

## 2. Fleet Analytics — расширение метрик

Файл: `src/pages/admin/FleetAnalytics.tsx`

### Top KPI bar (по выбранному периоду 7/30/90д + добавить "24h"):

```text
Capacity | Sent | Delivered | Failed | Delivered % | Revenue
```

- **Capacity** = `active_numbers_count × 200 × period_days`
- **Sent / Delivered / Failed** — из `whatsapp_message_events`
- **Delivered %** = delivered / sent
- **Revenue** = Σ по workspace (delivered_in_ws × workspace.delivered_rate_usd)

### Per-number table — добавить колонки:

```text
Number | Client | Cap | Sent | Used% | Delivered | Failed | Deliv% | Status
```

- **Cap** = 200 × period_days (или 0 если blocked)
- **Used%** = sent / cap

### Per-client table (новый блок):

```text
Client | Numbers | Cap | Sent | Delivered | Failed | Deliv% | Rate $ | Revenue
```

Группировка событий по `whatsapp_numbers.workspace_id`.

### Revenue panel (новый):

4 чипа: **24h / 7d / 30d / All-time** revenue. Считается из delivered events за окно × rate per workspace. Период-селектор уже есть, добавить "24h".

---

## 3. Admin → Clients — поле "Delivered rate"

В `NewClientDialog` и где редактируется workspace добавить input "Rate per delivered message ($)". Default 0. Только admin может менять.

---

## 4. Технические детали

- Период-селектор: добавить кнопку `1` (24h) рядом с `7/30/90`.
- `fetchAnalytics` грузит `workspaces.delivered_rate_usd`, кладёт в wsMap как объект `{name, rate}`.
- Per-client агрегация: вторая `Map<workspace_id, {sent, delivered, failed, numbers}>` через `numbers[].workspace_id` лукап.
- Capacity per number: `n.status === 'active' ? 200 * periodDays : 0`. Для 24h period_days = 1.
- Revenue: `delivered × rate` округлять до 2 знаков, форматировать `$X,XXX.XX`.
- Без новых edge functions — всё считается клиентски (как сейчас).

---

## Acceptance

- В Fleet Analytics видно 6 KPI (Capacity, Sent, Delivered, Failed, Deliv%, Revenue) с переключателем 24h/7d/30d/90d.
- Per-number таблица показывает Cap и Used% наряду с Delivered.
- Новая Per-client таблица показывает выручку и доставку по каждому workspace.
- Можно задать `delivered_rate_usd` для клиента в admin.
- Заблокированные номера не учитываются в Capacity.

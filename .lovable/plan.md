## Цель

Закрыть три пункта по партнёрской системе, опираясь на канонический слой `number_ownership` + `v_payout_basis`. Главный фокус — удобство: назначить/переназначить номер на партнёра, поменять rate в любой момент, переименовать BM — всё в 1-2 клика, без миграций или ручного SQL.

---

## 1. UI для `number_ownership` (главный пункт)

### A. На странице `PartnerDetail` — новая вкладка **"Numbers (truth)"**

Это то, по чему реально идут выплаты. Отдельно от BMs (BMs остаются как операционная группировка).

Таблица текущих активных назначений на этого партнёра (`effective_to IS NULL`):

| Номер | Display name | Role | Rate $/deliv | Since | Workspace | Действия |
|---|---|---|---|---|---|---|
| +9715... | ISKRA-01 | provider | `0.0050` (inline editable) | Nov 1 | ISKRA | History · Unassign |

- **Inline edit rate** — клик по rate → input → save → создаётся новая запись в `number_ownership` (закрываем старую через `effective_to=now()`, вставляем новую). История сохраняется.
- **Inline edit role** — `provider` / `referral` / `manager` — то же самое: закрытие старой записи, новая.
- **History кнопка** — открывает диалог со всеми предыдущими записями `number_ownership` для номера (от/до/rate/role/notes).
- **Unassign** — закрывает текущую запись (`effective_to=now()`), номер уходит в пул "unassigned".

Кнопка **"+ Assign numbers"** — открывает диалог:
- Список доступных номеров (по умолчанию unassigned + поиск по phone/name)
- Чекбоксы для bulk-выбора
- Выбор role + rate (применится ко всем)
- На сохранение — для каждого: закрыть предыдущее активное назначение (если есть на другого партнёра), создать новое.

### B. Глобальный экран `/admin/number-ownership`

Линк в Admin sidebar. Два таба:

1. **Unassigned (17)** — все номера без активной записи. Bulk select → "Assign to partner" (партнёр + role + rate).
2. **All assignments** — таблица всех активных, group by partner, с фильтром/поиском. Inline edit как выше.

### C. Inline rename BM на странице PartnerDetail

В существующей таблице BMs — поле названия BM становится inline-editable (клик → input → enter saves). UPDATE `business_managers.name`. Также добавить inline edit для `meta_bm_id`.

### D. Inline edit BM-assignment rate

В той же таблице BMs добавить колонку "Rate" с inline editor. Это правит `bm_partner_assignments.rate_usd` через "закрыть старую → вставить новую" чтобы не ломать историю выплат за прошлые периоды.

---

## 2. Partner Payout screen (`v_payout_basis`)

На той же `PartnerDetail` добавить вкладку **"Earnings (live)"** — читает напрямую из канонического truth-слоя, не зависит от runs/PDF.

UI:
- Range picker (default last 7 days)
- Сводная карточка: Total delivered, Total $ earned, # of numbers active
- Таблица per-day per-number:

| Day | Number | Delivered | Rate | Earned |
|---|---|---|---|---|
| 2026-05-19 | +9715... | 245 | 0.005 | $1.225 |

- Footer total в USD.

Запрос: join `v_payout_basis` с активным на момент дня `number_ownership` (используем `effective_from <= day AND (effective_to IS NULL OR effective_to > day)`), фильтр по `partner_id`.

Это даёт партнёру (и админу) точный preview без генерации payout_run.

---

## 3. Backfill 1,396 "unknown" events

Это события `whatsapp_message_events` где `whatsapp_number_id IS NULL` — они выпадают из `v_payout_basis`. Варианты:

- **Inbox-only** (рекомендация): пометить `source='inbox'` или специальный флаг, чтобы они навсегда не попали в payout. Это безопасно и обратимо.
- **Backfill из messages.metadata** — если у нас есть provider_message_id, попробовать восстановить `whatsapp_number_id` через conversations/messages. Сделать один SQL-update.

План: одной миграцией добавить попытку backfill из `messages` join `conversations.whatsapp_number_id`. То что не удалось — оставить как есть (не попадают в выплаты по дизайну view).

---

## Технические детали

- Все mutations идут через `supabase.from('number_ownership').insert/update` (admin RLS уже стоит).
- История неизменяемая — никогда не UPDATE rate напрямую, всегда close + insert новой записи (через RPC `set_number_ownership(p_number, p_partner, p_role, p_rate, p_notes)`, который мы добавим).
- Один RPC чтобы атомарно закрывать + открывать в транзакции.
- UI компонент `<InlineRateEditor>` будет переиспользован в трёх местах.

---

## Порядок реализации

1. Миграция: RPC `set_number_ownership(...)` + RPC `partner_earnings_breakdown(...)` для экрана earnings.
2. Frontend: вкладка "Numbers (truth)" + диалог "Assign numbers" на `PartnerDetail`.
3. Frontend: глобальный экран `/admin/number-ownership`.
4. Frontend: inline rename BM + inline edit BM-rate.
5. Frontend: вкладка "Earnings (live)" на `PartnerDetail`.
6. Backfill миграция для unknown events.

Делать буду последовательно — каждый шаг это отдельный коммит, можно остановиться где угодно.
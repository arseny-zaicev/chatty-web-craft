## Что не так

Проверил БД и код — стата на Portfolio врёт **из-за вьюхи `v_metrics_today`**, а не из-за UI.

Текущая `v_metrics_today` строится так:
- `sent` агрегируется по `(workspace_id, whatsapp_number_id, campaign_id)` — много строк на воркспейс
- `delivered` агрегируется по `(workspace_id, whatsapp_number_id)`
- `replies` агрегируется по `(workspace_id)` — одна строка на воркспейс
- потом всё это склеивается через `FULL JOIN`

Из-за `FULL JOIN` строки `delivered` и `replies` **дублируются на каждую строку sent**. А `portfolioMetrics.ts` потом просто `.sum()` всё подряд → числа умножаются.

Конкретно сейчас в БД (Dubai today):

| Workspace | sent (sum) | delivered (sum) | replies (sum) | rows во вьюхе | реальные replies today |
|---|---|---|---|---|---|
| Carrotsnotsticks | 761 | **1568** | **1080** | 4 | 270 |
| GoSwyft | 691 | 787 | **416** | 8 | 52 |
| Growth-onomics | 533 | 494 | **202** | 2 | 101 |
| ISKRA | 902 | 873 | 147 | 1 | 147 |
| Salesforge | 6 | 36 | **30** | 6 | 5 |

Поэтому на Portfolio видно **Delivered 3619 > Sent 2842** (бред — нельзя доставить больше чем отправлено) и **Replies 1785** вместо реальных ~575.

## Что чиним

### 1. Переписать `v_metrics_today` (миграция)

Разделить на нормальные слои без перекрёстной мультипликации:

```text
v_metrics_today              -- одна строка на workspace (totals)
  workspace_id, sent_today, delivered_today, failed_today, replies_today

v_metrics_today_by_number    -- одна строка на (workspace, number)
  workspace_id, whatsapp_number_id, sent_today, delivered_today, failed_today

v_metrics_today_by_campaign  -- одна строка на (workspace, campaign)
  workspace_id, campaign_id, sent_today, failed_today
```

Каждая вьюха считает свой срез независимым `GROUP BY` без `FULL JOIN`-мультипликации. `replies_today` живёт только на уровне воркспейса (т.к. реплаи не привязаны к номеру/кампании).

### 2. Обновить три места в коде

- **`src/lib/portfolioMetrics.ts`** (`fetchPortfolioSnapshot`):
  - `sent/delivered/replies_today` берём из `v_metrics_today` (по 1 строке на ws → суммирование больше не дублирует)
  - `active_campaign_sent` (today по группе кампаний) — из `v_metrics_today_by_campaign`
- **`src/lib/portfolioMetrics.ts`** (`fetchWorkspaceOverview`): из `v_metrics_today` (1 строка на ws)
- **`src/lib/metrics.ts`**:
  - `fetchWorkspaceMetrics` → `v_metrics_today`
  - `fetchNumberMetrics` → `v_metrics_today_by_number`

### 3. Регенерация типов

После миграции `src/integrations/supabase/types.ts` обновится автоматически.

## Что НЕ трогаем

- `v_metrics_alltime` — отдельная вьюха, не в этом баге.
- UI карточек на Portfolio — рендер правильный, чинить не надо.
- Логика sending/health/active_campaign_total — не трогаем, считаются из `campaigns`/`campaign_recipients` напрямую.

## Проверка после фикса

Запросом сравню `v_metrics_today.replies_today` с прямым `count(*)` из `messages WHERE direction='inbound' AND created_at >= dubai_start_of_day()` — должны совпадать по каждому воркспейсу. Также проверю `Delivered ≤ Sent` для каждого ws.

Жми Implement plan если ок.
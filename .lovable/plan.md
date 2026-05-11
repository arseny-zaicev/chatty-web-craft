## Новые тайлы Fleet Registry

```text
┌───────────┬─────────┬──────────┬─────────┬────────────┬──────────┐
│ Allocated │ Active  │ Warming  │ Stock   │ Restricted │ Banned   │
│    5      │   3     │    2     │   4     │     1      │    1     │
│ idle on   │ running │ heating  │ unassi- │ 30-day     │ permanent│
│ a client  │ campaign│ up       │ gned    │ block      │          │
└───────────┴─────────┴──────────┴─────────┴────────────┴──────────┘
                                                   ⚠ Sync failed: N (бейдж справа)
```

Хочу подтвердить: ты написал **"warning"** - имел в виду **warming** (прогрев)? Если да - использую warming. Если реально нужен тайл "warning" под технические проблемы - тогда туда уйдут sync_failed + любые другие алерты, но это смешает категории.

### Что считаем

| Тайл | Условие |
|---|---|
| **Allocated** | `is_active` AND `workspace_id IS NOT NULL` AND status ∈ (active, ready) AND **нет** активных кампаний |
| **Active** | `is_active` AND есть запись в `active_campaigns` (scheduled/running/paused) |
| **Warming** | status = `warming` |
| **Stock** | `workspace_id IS NULL` AND status ∉ (restricted, banned) |
| **Restricted** | status = `restricted` |
| **Banned** | status = `banned` |

**Sync failed** (`last_health_sync_error IS NOT NULL`) - выносим из ряда тайлов в маленький кликабельный бейдж рядом с кнопкой "Run health check" (показывается только если N>0). Это техническая ошибка проверки, не lifecycle-категория.

### Поведение

- Каждый тайл - кликабельный фильтр (как сейчас), повторный клик снимает.
- В `filtered`: расширяю локальный enum фильтра до `all | allocated | active | warming | stock | restricted | banned | sync_failed` и применяю условия выше (для `active` смотрю `active_campaigns.length > 0`, для `stock` - `workspace_id === null`).
- Кнопка "Clear filters" продолжает работать.

### Технические детали

- Файл: только `src/pages/admin/FleetRegistry.tsx`.
- `overview` useMemo переписать под 6 корзин + sync_failed отдельно.
- Никаких изменений в БД, edge functions, RLS, типах.

### Последний вопрос

**Warming или Warning?** (одно слово - и иду делать).

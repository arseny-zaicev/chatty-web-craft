## Цель
Дать тебе в workspace кнопку "Reconcile messages (24h)", которая без затрат токенов сверяет webhook-аудит с реальным состоянием БД, находит пропавшие сообщения, и автоматически их восстанавливает.

## Что покрывается

**Входящие (inbound)** — клиент написал, но в чате не появилось:
- Источник истины: `whatsapp_message_events` где `event_type = 'inbound_message_received'` (мы уже логируем сырой payload в прошлом фиксе)
- Сверка: для каждого такого события проверяем что есть соответствующий `inbound_message_persisted` ИЛИ запись в `messages` с тем же `provider_message_id`
- Если нет — восстанавливаем из `raw` payload (создаём conversation если нужно + insert в messages)

**Исходящие (outbound)** — отправили клиенту, но статус застрял:
- Источник: `campaign_recipients` со `status='pending'`/`'sending'` старше 1 часа, и `messages` direction=outbound без финального статуса (delivered/read/failed) старше 1 часа
- Сверка: смотрим в `whatsapp_message_events` есть ли status-updates от Gupshup (delivered/read/failed) по этому `provider_message_id`
- Если есть — синхронизируем статус в `messages` и `campaign_recipients`
- Если за 24ч вообще ничего не пришло — помечаем как `failed` с пометкой "no_status_update"

## Где живёт UI

Новая вкладка/секция в `WorkspaceOverview` (либо отдельный `WorkspaceSettings` блок) под названием **"Message Integrity"**:

```text
┌─ Message Integrity (last 24h) ────────────────────┐
│  Last check: 2 min ago     [Run check now] btn    │
│                                                    │
│  Inbound:   142 received → 142 persisted   OK     │
│  Outbound:  890 sent     → 887 confirmed   3 ⚠   │
│                                                    │
│  ⚠ 3 issues found:                                 │
│   • +57 313 588 5956  inbound  missing in chat   │
│     [Restore]                                      │
│   • +52 ...           outbound  no status 26h    │
│     [Mark failed]                                  │
│                                                    │
│  [Auto-fix all] [Last 7 days ▾]                   │
└────────────────────────────────────────────────────┘
```

## Edge function: `reconcile-messages`

Параметры: `workspace_id`, `hours` (default 24), `auto_fix` (bool).

Flow:
1. Auth: текущий юзер должен быть workspace manager (RLS уже покрывает).
2. Найти все номера workspace → `whatsapp_numbers.id[]`.
3. **Inbound pass:**
   - Select `whatsapp_message_events` где `event_type='inbound_message_received'` и `whatsapp_number_id IN (...)` и `created_at > now() - hours`.
   - Для каждого: проверить наличие `messages` row с тем же `provider_message_id` (из `raw.payload.id`).
   - Missing → если `auto_fix`: вставить conversation + message из raw, залогировать `inbound_message_recovered` event.
4. **Outbound pass:**
   - Select `messages` direction=outbound, status IN ('sent','queued'), `created_at < now() - 1h`.
   - Для каждого: в `whatsapp_message_events` искать события `message-event` с тем же `provider_message_id` и type=delivered/read/failed.
   - Если есть → update status. Если нет за 24ч → mark failed.
5. Вернуть JSON: `{ inbound: {checked, missing, recovered}, outbound: {checked, stuck, synced, failed}, issues: [...] }`.

**Никаких внешних API не зовём.** Только postgres. Токены = 0.

## Опциональный cron
Раз в час дёргать `reconcile-messages` со всеми workspace_id автоматически и при `missing > 0` слать алерт в существующий Slack dispatcher (отдельный event type `integrity_alert`).

## Файлы
- `supabase/functions/reconcile-messages/index.ts` — новая edge function
- `src/components/workspace/MessageIntegrityPanel.tsx` — UI компонент с кнопкой и списком issues
- `src/pages/workspace/WorkspaceOverview.tsx` — встроить панель
- (опционально) cron job через `supabase--insert` + `pg_cron`

## Что НЕ делаем
- Не звоним в Gupshup API (это стоило бы токены/лимиты)
- Не трогаем outbound текст — только статусы
- Не удаляем ничего; только insert/update восстановленных записей

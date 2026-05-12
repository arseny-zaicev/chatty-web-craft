# Template approval visibility

## Goal
Operator должен сразу понимать, по каким клиентам/номерам шаблоны одобрены и можно запускать кампанию, без ручного «Sync from Gupshup».

## 1. Авто-sync шаблонов (cron 9-21 Dubai, каждый час)

- Новая edge-функция `templates-status-sync`:
  - Берёт все активные `whatsapp_numbers` с `provider_app_id`.
  - Для каждого вызывает существующий `fetchGupshupTemplates` и сравнивает старый `status` (из `message_templates`) с новым.
  - Апсертит изменения и собирает diff: `{ workspace_id, whatsapp_number_id, approved[], rejected[], paused[], pending[], changes: [{ name, from, to }] }`.
- Cron в БД (через `pg_cron` + `pg_net`, через insert-tool, не migration):
  - Schedule: `0 5-17 * * *` UTC = 9:00-21:00 Asia/Dubai, каждый час.
- Ручной `Sync from Gupshup` остаётся как есть.

## 2. Slack уведомления

- При каждом diff с непустыми изменениями шлём в `SLACK_OPS_CAMPAIGNS_CHANNEL_ID` блок:
  - Заголовок: `Templates updated · <Client / Workspace name>`
  - Линия per-number: `+<phone> (<display_name>) — ✅ approved: gf_main_us, ❌ rejected: foo_v2`
  - Сводка снизу: `Total: 12 approved · 2 pending · 1 rejected · 0 paused`
  - Кнопка-ссылка на Fleet: `<APP_BASE_URL>/admin/fleet?number=<id>`
- Если изменений нет - Slack не дёргаем.
- Дедуп: храним последний отправленный `status` в `message_templates.status`, чтобы повторно не алертить.

## 3. Banner в Fleet (`/admin/fleet`)

- Новый компонент `FleetTemplatesHealth` сверху страницы:
  - Группировка по `workspace` (клиент) → внутри по номеру.
  - На каждый номер: chips `12 approved · 2 pending · 1 rejected`, цвет по «готовности» (зелёный если ≥1 approved и 0 pending blocking, янтарный если есть pending, красный если только rejected).
  - Кнопка `Sync now` на номер (вызывает существующий `sync_templates`).
  - Метка `Last synced: 12m ago` из `synced_at` (max по номеру).
- Источник данных: новый RPC `fleet_templates_summary()` или прямой select из `message_templates` агрегацией (admin-only через RLS - `is_workspace_manager`/admin).

## Технические детали

- Файлы:
  - `supabase/functions/templates-status-sync/index.ts` (новая, выносим общую часть из `campaigns/syncTemplates` в шаренный модуль или вызываем `supabase.functions.invoke('campaigns', { action: 'sync_templates' })` per number, но лучше прямой код чтобы получать diff).
  - `supabase/functions/_shared/slack.ts` уже есть, добавить хелпер `sendTemplatesDigest(workspaceName, numbers, totals)`.
  - `src/pages/admin/FleetRegistry.tsx` - вставить `<FleetTemplatesHealth />` в шапку.
  - `src/components/admin/FleetTemplatesHealth.tsx` - новый.
- Расписание: insert через supabase insert-tool (не migration), так как содержит URL+anon key.
- Slack channel: `SLACK_OPS_CAMPAIGNS_CHANNEL_ID` (уже в secrets).
- Без новых таблиц - diff считается на лету сравнением старого/нового `status`.

## Acceptance

1. Каждый час с 9 до 21 Dubai шаблоны переcинхронизируются автоматически.
2. При изменении статуса хоть одного шаблона - сообщение в Slack #ops-campaigns с разбивкой по клиенту/номеру.
3. На `/admin/fleet` сверху видно по каждому клиенту/номеру: сколько approved/pending/rejected, когда последний sync.
4. Ручной Sync from Gupshup продолжает работать.

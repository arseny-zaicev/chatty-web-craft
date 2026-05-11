## Что я нашёл

**1. Алерт ~90 мин назад - не про лиды**

Последний alert в `delivery-leads` (10:27 UTC) был `inbound_silence`, а не "leads not arriving":

> ":warning: No inbound WhatsApp messages received in last 90m across 6 active number(s). Webhook may be down."

Проверил `messages`: последний inbound пришёл 08:56 UTC (~92 мин назад). Outbound идут (последний 08:58), а Gupshup webhook не доставляет входящие. Это webhook issue, не lead-pipeline.

Старые алерты `leads_pending_backlog` / `leads_queued_backlog` стреляли в 07:27-07:39, но прямо сейчас в `lead_imports` **нет** ни одной строки в статусах `pending` / `queued` - dispatch отработал.

**2. Pipeline "Nitish / Ads / India / Delivery" - в порядке**

- Workspace ISKRA, pipeline `28e660ae...`, auto_outreach_enabled = true
- 2 source_connections, обе `active`, без `last_error`, последний sync 10:28 UTC (cron жив)
- За 6ч: 19 батчей, все `completed`, 100% accepted, дальше `sent` / `replied` (никто не залип)

**3. "Вторая таблица" - не сломана, она просто почти пустая**

Sheet `Warm Leads | BM | India | Nitish | Bala` (`1le-OeCWoTTt1JLBny_Xzc4sdrvb4LIOuYOQyNZ2d0Jk`):
- `last_synced_row: 4` → всего 3 строки данных, все уже импортированы (последний импорт 08:52 UTC).
- За 6ч: 2 батча из этого источника против 17 из основного. Это поведение источника, не баг sync-а.

То есть с обеих таблиц новых лидов просто нет с 08:56 UTC, а sync продолжает опрашивать каждые 2 мин.

---

## План исправления

### Шаг 1. Починить Gupshup webhook (это и есть реальный алерт)

1. Дёрнуть `gupshup-set-callback` для всех 6 активных номеров - переустановит inbound URL.
2. Проверить через 2-3 мин: должен появиться свежий inbound в `messages` (и алерт сам перестанет повторяться через 30-минутный debounce).
3. Если callback переустанавливается без эффекта - открыть edge-логи `whatsapp-webhook` за период тишины: проверить, поступают ли запросы вообще (если да - падает обработчик; если нет - проблема на стороне Gupshup, эскалируем им).

### Шаг 2. Подтвердить, что lead-ingest здоров (не требует кода)

- `source_connections.last_error` пуст, `last_ingest_at` свежий → ничего не правим.
- Если хочется убедиться "вживую" - залить тестовую строку в Sheet 2 и через ~2 мин убедиться, что появился новый `import_batch` и `lead_import` со статусом `sent`.

### Шаг 3 (опционально). Сделать алерт менее путающим

Сейчас `inbound_silence` легко прочитать как "не приходят лиды". Два маленьких улучшения в `supabase/functions/health-watchdog/index.ts`:

- Переформулировать текст: `"WhatsApp inbound webhook silent — no replies/messages received... (this does NOT mean lead imports are broken; check lead-dispatch alert separately)"`.
- Добавить в payload метку `category: "webhook"` чтобы в Slack блоке выводить заголовок `Webhook` вместо общего warning - тогда видно, что это не про ingestion.

### Что НЕ делаем

- Не трогаем `google-sheets-sync` / `lead-dispatch` - там всё работает.
- Не меняем источники / pipeline config.

---

### Технические детали

- Pipeline ID: `28e660ae-11c1-4511-9c59-a6c6b14fffd2`
- Sources: `d26263c0...` (основной, 17 батчей/6ч), `2c73c43c...` (Nitish|Bala, 2 батча/6ч, всего 3 строки в листе)
- Алерт-источник: `health-watchdog`, kind `inbound_silence`, порог `INBOUND_SILENCE_MIN = 90`
- Реальная проблема: Gupshup → `whatsapp-webhook` молчит с 08:56 UTC при 6 активных номерах
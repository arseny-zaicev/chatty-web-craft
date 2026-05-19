# Audit: что не так с датами и именами батчей

## Что я нашёл (по скриншотам + коду)

### 1. Двойной префикс "DATE | COUNTRY" в имени кампании (главная боль)

Скрин 2 показывает имя кампании:
`2026-05-19 | UK | 2026-05-18 | UK | Mixed Founder-Led Services | iskra uk main | C...`

Причина — два независимых билдера имени, которые конкатятся:

- `src/pages/workspace/WorkspaceData.tsx:239` — `buildBatchName(country, audience)` сохраняет батч под именем `"YYYY-MM-DD | COUNTRY | AUDIENCE"` в `audience_batches.name`.
- `src/pages/workspace/LaunchWizard.tsx:250-256` — авто-заполняет поле `audience` ПОЛНЫМ именем батча (`dbBatch.name`), включая дату и страну.
- `src/lib/launchData.ts:286 buildCampaignName` — делает `${today} | ${geo} | ${audience} | ${template} | ${cta}` и снова клеит дату+страну спереди.

Итог: имя кампании всегда содержит сегодняшнюю дату + дату батча и страну дважды.

### 2. Куча пустых батчей на одну и ту же дату (5 строк "2026-05-18 | UK | …")

Скрин 1: четыре батча "0 unused / 0 valid" + один настоящий 2695/2695.

Происхождение:
- В `WorkspaceData` оператор может несколько раз нажать "Create batch" — каждый раз создаётся новая запись в `audience_batches` (Lovable Cloud).
- Codex/AI по промпту в `src/lib/prepPresets.ts:238-243` вставляет строки в **личный** Supabase под `batch_id`, который оператор передал. Если batch_id не совпал (опечатка, новый prep, старый prompt с дефолтом), `import-audience-from-personal` дёрнет пустой набор → батч остаётся 0/0.
- Никакой dedupe-проверки по (workspace, name) или (workspace, date, audience) в коде нет.

И самое опасное — LaunchWizard.tsx:243-248 авто-выбирает первый батч из списка (он отсортирован `created_at desc` в `fetchBatches`, `src/lib/audienceData.ts:300`). То есть мастер запуска по умолчанию ставит **самый свежий пустой stub**, а не реальный батч с 2695 контактами. Это и есть "подставляет что-то неверное совершенно".

### 3. Таймзонный разлад между двумя билдерами имени

- `buildBatchName` (`WorkspaceData.tsx:240`) использует `new Date().toISOString().slice(0,10)` → **UTC**.
- `buildCampaignName` (`launchData.ts:287-292`) использует `d.getFullYear/getMonth/getDate` → **локальное время браузера**.

Ты в Дубае (UTC+4). После 04:00 GST UTC ещё показывает вчерашний день. Утром в Дубае создаётся батч с датой "вчера UTC", а кампания запускается с датой "сегодня GST" — разные даты в одном имени. Это вторая причина того, что в скрине 2 видна пара "2026-05-19 | UK | 2026-05-18".

### 4. Промпт в personal Supabase, который ты просил починить

Я проверил оба промпта:
- `src/lib/prepPresets.ts:185-253` — INSERT TARGET корректно указывает personal Supabase (`PERSONAL_SUPABASE_PROJECT_REF`, `PERSONAL_SUPABASE_URL`), workspace_id и batch_id подставляются из контекста. Это **правильно**.
- `src/lib/prepProfiles.ts:217-308` (legacy prep prompt) — всё ещё указывает `INSERT TARGET (Supabase) table: public.audience_rows` **без явного указания personal vs Lovable Cloud**. Если Codex по ошибке возьмёт этот промпт, он вставит строки в Lovable Cloud → потом `import-audience-from-personal` не найдёт ничего → ещё один stub 0/0. Это, скорее всего, то, что ты имел в виду.

Ни один из промптов не предупреждает Codex переиспользовать существующий батч на ту же дату/страну/аудиторию вместо создания нового.

---

## Что предлагаю исправить (Plan Mode — только описание)

### Fix 1 — убрать двойной префикс в имени кампании
В `LaunchWizard.tsx` (~строки 250-256) при авто-заполнении `audience` из `dbBatch.name` срезать ведущие `YYYY-MM-DD | COUNTRY | ` если оно там есть, оставив только хвост `Mixed Founder-Led Services`. Регулярка: `^\d{4}-\d{2}-\d{2}\s*\|\s*[A-Z-]{2,}\s*\|\s*`. Тогда `buildCampaignName` снова склеит ровно `DATE | COUNTRY | AUDIENCE | TEMPLATE | CTA`.

### Fix 2 — одинаковая таймзона для имени батча и кампании
В `buildBatchName` (`WorkspaceData.tsx:240`) и `buildCampaignName` (`launchData.ts:287-292`) использовать одну хелпер-функцию `dateKeyInTz(new Date(), 'Asia/Dubai')` (она уже есть в `src/lib/timezones.ts`). Это решает "вчера в UTC vs сегодня в GST".
Альтернатива: использовать TZ страны кампании (`tzInfo(country).tz`) — тогда имя батча для UK будет в London, для AE в Dubai. Но проще всегда workspace-time (Dubai) и зафиксировать в комментарии.

### Fix 3 — не предлагать в Launch заведомо пустой батч
В `LaunchWizard.tsx:243-248` менять авто-пик: вместо `data![0]` брать первый батч с `unused > 0` (данные уже есть через `useAudienceBatchesQuery` в `src/lib/audienceData.ts` — там есть stats). Если все пустые — оставить пусто и показать предупреждение.

### Fix 4 — почистить накопившийся мусор + защита на будущее
- В `WorkspaceData.tsx` (`buildBatchName` + `createBatch`-мутация около строки 360) перед инсертом проверить наличие батча с тем же `name` в этом workspace. Если есть — переиспользовать (вернуть его `id`) и не плодить дубль.
- В UI списка батчей выделять "0 unused / 0 valid" как warning с кнопкой "Delete empty batch".
- Опционально: миграция, которая навешивает unique-index `(workspace_id, lower(name))` на `audience_batches` чтобы дубли больше не создавались.

### Fix 5 — выровнять промпты
- В `src/lib/prepProfiles.ts:292-297` явно прописать "INSERT TARGET (PERSONAL Supabase project — NOT Lovable Cloud)" + ссылку на ENV-константы, ровно как в `prepPresets.ts`. Это закроет риск, что старый промпт инсертит не туда.
- В обоих промптах добавить раздел "BEFORE INSERT: если в Lovable Cloud уже есть batch с именем `YYYY-MM-DD | COUNTRY | AUDIENCE` для этого workspace — переиспользуй его batch_id, не проси оператора создавать новый".

### Fix 6 (диагностика, не правка)
Прогнать SQL по `audience_batches` workspace ISKRA, чтобы:
- посчитать все пустые батчи за последние 7 дней,
- посмотреть, есть ли строки в `audience_rows` для каждого stub'а (быстрая выборка через `supabase--read_query`), и одной командой их удалить.

---

## Технические детали

```text
audience_batches.name = "2026-05-18 | UK | Mixed Founder-Led Services"
                            │           │   └── operator-provided "audience"
                            │           └────── COUNTRY (uppercased)
                            └────────────────── date in UTC  ← bug source #2

LaunchWizard.audience      = dbBatch.name (вся строка целиком)  ← bug #1
campaign.name (auto)       = `${today_local} | ${country} | ${audience} | ${template} | ${cta}`
                           = "2026-05-19 | UK | 2026-05-18 | UK | Mixed Founder-Led Services | iskra uk main | C..."
```

Файлы под правку:
- `src/pages/workspace/WorkspaceData.tsx` — Fix 2, Fix 4
- `src/pages/workspace/LaunchWizard.tsx` — Fix 1, Fix 3
- `src/lib/launchData.ts` (buildCampaignName) — Fix 2
- `src/lib/prepProfiles.ts` и `src/lib/prepPresets.ts` — Fix 5
- (опционально) миграция `audience_batches_unique_name`

---

## Порядок выполнения, если апрувишь

1. Fix 1 + Fix 3 (5 минут, разблокирует тебе текущий запуск).
2. Fix 2 (TZ-консистентность).
3. Fix 4 (защита от дублей + чистка через SQL).
4. Fix 5 (промпты — чтобы Codex больше не плодил пустышки).

Скажи "go 1+3", "go all" или что именно делать — никаких изменений в коде до твоего OK.

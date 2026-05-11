## Идея

После завершения кампании (или по запросу в любой момент) клиент / ты получаете:
1. **Сырой CSV** — построчно по каждому контакту: что ушло, дошло, ответили / нет, текст ответа, классификация ответа, какой шаблон / оффер / номер использовался.
2. **AI-сводка (PDF / Markdown)** — кто реагирует лучше всего (по отрасли, гео, размеру, должности и т.д.), какая копия сработала, какие сегменты стоит масштабировать, кого исключить.

Всё это уже реально, потому что в БД лежит почти всё нужное: `campaign_recipients` (статус, шаблон, номер, переменные с обогащением аудитории), `conversations`, `messages` (входящие ответы), `audience_rows.payload` (исходные поля лида — индустрия, должность, страна и т.п.), `message_templates` (текст оффера).

---

## План (5 шагов)

### 1. Классификация ответов (replies tagging)
Добавить в `conversations` (или отдельную таблицу `conversation_insights`) поля:
- `reply_sentiment` — `positive | neutral | negative | objection | not_interested | ooo`
- `reply_intent` — `meeting | pricing | info | wrong_person | unsubscribe | spam | other`
- `first_reply_text`, `first_reply_at`, `time_to_first_reply_seconds`
- `tagged_at`, `tagged_by` (`ai` / `user_id`)

Заполнение:
- **Авто (AI)** — edge function `classify-replies` берёт первые 1-3 входящих сообщения по conversation, прогоняет через Lovable AI (`google/gemini-2.5-flash`) с jsonschema-промптом, пишет результат. Запускается батчами после кампании + ночным cron.
- **Ручное переопределение** в инбоксе (фишки в conversation header) — на будущее, не блокер.

### 2. View / RPC для отчёта
Создать SQL view `campaign_report_rows` со следующими колонками на каждого `campaign_recipient`:
- contact_phone, contact_name, страна, и **все поля из `audience_rows.payload`** (industry, role, company, employees… — то, что было в импорте)
- whatsapp_number_used, template_name, template_body (snapshot оффера)
- delivery_status (sent / failed / read), sent_at, failed_reason
- replied (bool), first_reply_text, time_to_first_reply, reply_sentiment, reply_intent
- conversation_url (deep link в инбокс)

И RPC `get_campaign_report(campaign_id)` с RLS-проверкой workspace member.

### 3. Экспорт CSV / XLSX
Кнопка **«Download report»** на странице кампании (admin + workspace):
- Edge function `campaign-report-export` отдаёт CSV (стрим, чтоб не падать на 50k строк).
- Опционально XLSX через `xlsx` npm в edge — оставим CSV в v1, XLSX в v2.
- Файл имя: `{client}-{campaign_name}-{YYYYMMDD}.csv`.

### 4. AI-сводка («Insights»)
Edge function `campaign-insights` берёт агрегаты из view + сам прогоняет AI (Lovable AI, `google/gemini-2.5-pro`) с промптом вида:

> «Вот распределение ответов по индустрии / должности / стране / размеру компании / шаблону. Скажи: 1) топ-3 сегмента с самым высоким positive reply rate, 2) что у них общего, 3) сегменты с высоким negative / not_interested — их исключить, 4) какая копия (template) сработала лучше и почему, 5) рекомендации по следующей итерации аудитории».

Сохраняем в `campaign_insights` (campaign_id PK, summary_md, generated_at, model). UI: вкладка **«Insights»** на кампании — рендер markdown + chart-блоки (reply rate by industry / role / template).

### 5. Доставка клиенту
Три канала:
- **В UI** (workspace → campaign → tabs `Overview / Recipients / Insights / Export`).
- **Slack** — после `Campaign finished` уведомление автоматически прикладывает кнопки «Download CSV» и «Open insights».
- **Email** (опционально, v2) — раз в неделю «Weekly intel digest» по всем кампаниям клиента.

---

## Технические детали

**Файлы / миграции:**
- migration: `conversation_insights` (или колонки в `conversations`) + `campaign_insights` + view `campaign_report_rows` + RPC.
- `supabase/functions/classify-replies/index.ts` — батч-классификатор.
- `supabase/functions/campaign-report-export/index.ts` — стрим CSV.
- `supabase/functions/campaign-insights/index.ts` — AI-сводка.
- `src/pages/workspace/WorkspaceCampaigns.tsx` + новый `CampaignDetail.tsx` с табами Overview / Recipients / Insights / Export.
- Slack `slackBlocks.ts` — добавить кнопки в финальный блок.
- Cron: добавить `classify-replies` в `cron-heartbeat` (раз в 15 мин, лимит 200 conversations за тик).

**Стоимость / лимиты:**
- Классификация — `gemini-2.5-flash`, ~1 запрос на conversation, дёшево.
- Insights — `gemini-2.5-pro`, 1 запрос на кампанию, разово.
- CSV — без AI, мгновенно.

**Что НЕ делаем в v1:**
- Ручной re-tagging в UI (только просмотр).
- XLSX / PDF (CSV + markdown достаточно).
- Cross-campaign benchmarking («вот тут сегмент X стабильно лучше во всех твоих кампаниях») — отдельный шаг v2 после того, как накопим данных.

---

## Порядок выкатки

1. Миграция + view + RPC (1 шаг).
2. `classify-replies` + cron — данные начинают копиться.
3. CSV export — самое полезное прямо сейчас, можно отдавать клиентам уже на следующий день.
4. AI insights — поверх данных, когда классификация набралась.
5. Slack-кнопки + UI tabs.

После approve — иду по этому порядку, каждый шаг отдельным commit-ом, чтобы можно было ревьюить по частям.
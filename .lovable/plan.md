## Что я нашёл (короткий диагноз)

**1. Таблицу видит правильно.** Google Sheet sync прочитал все 1369 строк, парсит `vorname` + `telefonnummer`, страна по умолчанию +49.

**2. Откуда взялись "812 дубликатов".** Это НЕ настоящие дубли по телефону внутри таблицы (таких всего 15 номеров / 21 строка). Это артефакт того, что edge-функция `google-sheets-sync` запускалась 10 раз подряд (09:16 → 09:24), первые запуски частично писали записи в `lead_imports` со status `duplicate` из-за гонки, и теперь у нас в БД зашумлено: 812 строк со статусом `duplicate`, хотя реально занятых телефонов всего ~70 (49 — это вчерашняя ручная рассылка + 21 настоящий внутрисетовый дубль).

   Результат: **в очередь auto-dispatch попали только 495 лидов** из 1368. Остальные 812 заблокированы статусом `duplicate` и dispatcher их не возьмёт.

**3. Настройки пайплайна НЕ сохранены.** В БД для `Reactivation Leads / DE` сейчас: `auto_outreach_enabled = false`, `daily_cap = NULL`, `default_sender_number_ids = []`, `first_touch_template_group_id = NULL`, `sending_window.timezone = Asia/Kolkata`. На твоём скрине открыта форма с правильными значениями (FE Reactivaiton Leads group, 3 sender'а, 08-20 Europe/Berlin, daily cap 50) - но кнопка "Save changes" ещё не нажата (либо нажата и не дошло). Без `auto_outreach_enabled = true` dispatcher этот пайплайн не трогает вообще.

**4. Daily cap считается неправильно для "50 доставленных".** В `lead-dispatch/index.ts` лимит = `count of (queued, sent, replied, failed) WHERE scheduled_at >= today (UTC)`. Проблемы:
   - `failed` считается → если 10 упали, dispatcher всё равно остановится на 40 успешных.
   - День считается по UTC, а не по Europe/Berlin (окно 08-20 Berlin).

---

## Что я предлагаю сделать (за один заход)

### Step 1. Почистить мусор в `lead_imports` для этого источника

```text
For source_connection_id = 2c28bdf7-... (Reactivation Leads / DE):
  - Reset status to 'awaiting_manual' for rows where:
      status = 'duplicate'
      AND conversation_id IS NULL   ← т.е. вчера руками не отправляли
      AND phone NOT IN (already-used-yesterday phones from 49 convs)
      AND phone не повторяется внутри самой таблицы (оставить первую, остальные duplicate)
  - Keep status = 'duplicate' для тех 49 номеров, которым вчера отправил руками.
  - Keep status = 'invalid' для 61 битого номера.
```

Ожидаемый результат: ~1258 лидов в `awaiting_manual`, 49 `duplicate` (вчерашние), 61 `invalid`. Эти 1258 dispatcher будет автоматически разносить по 50/день.

### Step 2. Сохранить настройки пайплайна

Применю напрямую SQL-апдейтом (то, что у тебя на скрине, но БД пока не видит):

```text
pipeline Reactivation Leads / DE:
  auto_outreach_enabled = true
  first_touch_template_group_id = <FE - Reactivaiton Leads - First message group_id>
  default_sender_number_ids = [PramodElemOrgNum2, Yasim, Yasin]
  sending_window = { start: '08:00', end: '20:00', timezone: 'Europe/Berlin' }
  daily_cap = 50
  expected_country_codes = ['49']
  slack_channel_id = <текущий>
```

Параллельно гляну, почему UI-кнопка "Save changes" возможно не сработала (проверю в network logs после твоего следующего клика).

### Step 3. Исправить semantics "50 доставленных/день"

В `supabase/functions/lead-dispatch/index.ts`:
- Убрать `failed` из счётчика дневного лимита → останется `(queued, sent, replied)`.
- Считать день по `sending_window.timezone` пайплайна, а не по UTC.
- Считать по `sent_at` (момент доставки), а не `scheduled_at`, чтобы зашедулинные на сейчас, но ещё не отправленные, не "съедали" квоту.

Эффект: если за день 10 шт упали в `failed`, dispatcher возьмёт ещё 10 awaiting_manual, пока не наберёт 50 реальных `sent` в окне 08-20 Berlin.

### Step 4. Визуализация для тебя (как понять что всё ок)

Добавлю в Pipeline view (для FE workspace) маленький бейдж рядом с названием пайплайна:
```text
Reactivation Leads / DE  · Auto ON · 12/50 today · 1246 queued
```
- `12/50 today` — сколько уже доставлено сегодня в окне 08-20 Berlin / лимит.
- `1246 queued` — сколько ещё ждёт в awaiting_manual.
- Цвет: зелёный (running), жёлтый (paused), серый (auto off).

Кликабельно → открывает Dispatch Control Panel с детализацией: split по номерам, последние отправки, ошибки.

---

## Что НЕ войдёт в этот заход

- Изменения логики `google-sheets-sync` (чтобы предотвратить повтор гонки). Сейчас 1 раз почистим вручную, потом надо отдельно укрепить функцию (lock + idempotency).
- Round-robin справедливость по сеттерам/номерам — там есть отдельный механизм allocation, не трогаем.
- Уведомления в Slack про "10 failed подряд / health" — отдельная задача.

---

## Технические детали

**Файлы, которые трону:**
- `supabase/functions/lead-dispatch/index.ts` — поправить daily-cap query (строки ~217-225).
- `src/components/workspace/PipelineList.tsx` (или эквивалент) — добавить бейдж со статусом.
- Новый helper-хук `useLivePipelineStats(pipelineId)` в `src/lib/pipelines.ts` — `lead_imports` counters + realtime подписка.

**SQL-операции (через insert-tool, не migration):**
- 1 UPDATE по `lead_imports` (cleanup).
- 1 UPDATE по `pipelines` (config).

**Подтверждения которые нужны от тебя перед стартом:**
1. **OK почистить 763 строки `duplicate` → `awaiting_manual`** (всё кроме 49 вчерашних номеров и 21 внутрисетового дубля)?
2. **OK применить настройки пайплайна напрямую SQL** (как на твоём скрине), не дожидаясь пока ты сохранишь руками?
3. **OK поменять semantics "50 = доставленных, не отправленных"** в коде dispatcher?
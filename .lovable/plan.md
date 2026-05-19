## Проблема

Сейчас `marketing_instant` для свежей кампании (`campaign_id` ещё нет) **гарантированно ломается**:

- `campaigns/index.ts` строки 213-222 — если нет `reuseCampaignId`, возвращает 409 `must_prepare`.
- А `prepareCampaign` (строки 1925-1932) пишет `prepared_at/signature` в БД **только если** есть `reuseCampaignId`.
- Для свежей кампании `campaign_id` физически нет до самого launch → ни один prepare никогда не сохраняется → launch всегда падает.

Кнопка "Mark reviewed" в UI — это вообще локальный fingerprint в `sessionStorage` (LaunchWizard.tsx 727-749), backend о ней ничего не знает.

DispatchControlPanel зовёт `action=prepare` и получает обратно `snapshot.signature`, но LaunchWizard эту подпись **никуда не передаёт** при launch.

## Решение (минимум кода, без перестройки)

Передавать подпись снапшота в launch и проверять её на сервере. Если совпадает с подписью, рассчитанной из тех же входов запроса launch — снапшот считается «свежим» даже без `campaign_id`.

### 1. Frontend — `src/pages/workspace/LaunchWizard.tsx`

- В `dispatchState` (из `DispatchControlPanel.onSnapshotChange`) уже есть `signature`. Добавить его в тело launch:
  ```ts
  snapshot_signature: dispatchState.signature,
  ```
- Дизейблить «Launch now» для `marketing_instant`, если `!dispatchState.ok || !dispatchState.signature`. Внутренний клиентский `snapshotValid` (sessionStorage) оставляем как «человеческая отметка», не как блокировку.

### 2. Backend — `supabase/functions/campaigns/index.ts`

В блоке `if (dispatchMode === "marketing_instant")` (строки 207-223):

- Если `reuseCampaignId` — старая логика остаётся (читаем из БД).
- Если **нет** `reuseCampaignId`:
  - Прочитать `body.snapshot_signature`.
  - Посчитать ожидаемую подпись через уже существующую `computeSnapshotSignature({ numberIds, templateIds, audienceCount: recipients.length, windowStart, windowEnd, perNumberQuota, maxInflightPerNumber, maxInflightPerCampaign })`.
  - Если совпадает — пропускаем launch.
  - Если нет / отсутствует — отдаём 409 `must_prepare` с понятным сообщением «Click *Mark reviewed* / re-run snapshot — inputs changed after prepare.»

Это закрывает реальный риск, который защищал must_prepare (оператор увидел блокеры/варнинги), потому что подпись детерминистски привязана к тем же входам.

### 3. Snapshot fingerprint UX (опционально, ~5 минут)

В LaunchWizard блок «Snapshot not yet confirmed / Mark reviewed» — переписать на серверный статус:
- Если `dispatchState.ok && dispatchState.signature` — зелёный «Snapshot ready (server-verified)».
- Иначе — оранжевый «Prepare snapshot first» с автоскроллом к `DispatchControlPanel`.

Старый клиентский fingerprint можно удалить (`snapshotKey`, `confirmedSnapshot`, `snapshotFingerprint`) — он только путает.

## Файлы

- `supabase/functions/campaigns/index.ts` — снять deadlock, принять `snapshot_signature`.
- `src/pages/workspace/LaunchWizard.tsx` — пробросить `snapshot_signature`, упростить UI снапшота.
- (опц.) `src/components/workspace/DispatchControlPanel.tsx` — без изменений; уже отдаёт signature через `onSnapshotChange`.

## Что НЕ трогаем

- `prepareCampaign` (логика и snapshot-отчёт).
- Paced mode (его deadlock не касается).
- Kill-switch, stale_snapshot для повторных запусков по `campaign_id`.

## Порядок

1. Backend: принять `snapshot_signature` + сверить hash. Deploy edge function.
2. Frontend: пробросить `snapshot_signature` в launch.
3. UI: заменить локальный fingerprint на серверный статус (опц.).
4. Тест: открыть LaunchWizard → выбрать numbers + audience → Prepare в DispatchControlPanel → Launch now должен пройти.

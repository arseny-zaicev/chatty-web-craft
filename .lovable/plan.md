## Что я уже увидел по фактам

1. Это не только проблема `+91`.
   - Ankur импортирован как `918269603031`, то есть номер уже нормальный для India.
   - Сообщения по нему реально пытались отправляться, но падали.

2. Главная причина текущих failed:
   - Gupshup возвращает `OAuthException, (#131008) Required parameter is missing`.
   - У шаблона `bm_request_confirmation` есть переменная `{{1}}`, а в `campaign_recipients.variables` сейчас пусто: `{}`.
   - Поэтому отправка уходит без обязательного параметра шаблона. Это объясняет, почему даже нормальный номер Ankur падает.

3. Есть отдельный баг с повторной постановкой одного и того же лида в очередь.
   - По Ankur уже создано много `campaign_recipients`, но `lead_imports` всё ещё `awaiting_manual` и не привязан к recipient.
   - Значит `lead-dispatch` вставляет recipient, но не всегда успешно обновляет сам `lead_imports`.
   - Cron снова видит этот лид как `awaiting_manual` и повторно создаёт отправки.

4. Проблема `+91` всё равно нужна.
   - Сейчас `p:+918269...` чистится нормально.
   - Но `p:7909022806` станет `7909022806`, без country code.
   - Для India надо превращать 10-значные локальные номера в `91xxxxxxxxxx`.

5. Ответы на вопросы уже попадают в `lead_imports.payload`.
   - Например у Ankur есть `company_name`, `email`, `do_you_currently_own_or_manage_a_meta_business_manager?`, `has_this_business_manager_previously_run_ads?`, `is_the_business_manager_verified?`.
   - Сейчас они не передаются в `campaign_recipients.variables` и не показываются нормально в контексте отправки.

## План исправления

### 1. Остановить повторные отправки одного и того же лида

В `lead-dispatch`:
- перед вставкой recipient проверять, что у лида ещё нет `campaign_recipient_id` или активного recipient по этому lead/import;
- сделать обновление `lead_imports` более надёжным: если recipient создан, статус лида должен стать `queued`, а не оставаться `awaiting_manual`;
- если обновление лида не удалось, не оставлять новый recipient как scheduled - пометить его failed/cancelled-подобным безопасным статусом через существующий `failed` с понятной ошибкой, чтобы cron не размножал дубли;
- добавить защиту от дублей по связке `pipeline_id + phone + first_touch campaign date`, чтобы один imported lead не создавал 10 одинаковых попыток.

### 2. Заполнить обязательные переменные шаблона

В `lead-dispatch`:
- при создании `campaign_recipients` формировать `variables` из данных лида;
- для текущего шаблона с `variables: ["1"]` передавать:
  - `1 = lead.name`, если имя есть;
  - иначе `1 = "there"` как безопасный fallback.

Это должно убрать `(#131008) Required parameter is missing` для Ankur и похожих лидов.

### 3. Нормализовать телефоны правильно для Meta/Sheets

В `google-sheets-sync` и `lead-intake`:
- чистить префиксы до номера: `p:`, `P:`, `П:`, `tel:`, `phone:`, `whatsapp:`;
- пропускать Meta test leads как `skipped_test`, а не считать их обычными invalid;
- добавить поддержку `default_country_code` в `source_connections.config`;
- для India sources поставить `default_country_code: "91"`;
- если номер после очистки 10-значный и задан default country code, сохранять как `91xxxxxxxxxx`;
- если номер уже начинается с `91` и нормальной длины, не добавлять код второй раз.

### 4. Починить текущие данные после исправления кода

Один раз после деплоя:
- у India source выставить `default_country_code: "91"`;
- поправить второй source: `name_column` сейчас `namefull_name`, надо `full_name`;
- для существующих invalid/awaiting_manual лидов попробовать повторно нормализовать телефон;
- валидные лиды перевести в `pending`, только если они ещё не были успешно поставлены/отправлены;
- для дублей Ankur оставить только одну актуальную scheduled/queued попытку, остальные failed с понятной причиной вроде `duplicate first-touch attempt cleanup`.

### 5. Передавать ответы на вопросы в контекст лида

В `lead-dispatch`:
- сохранять в `campaign_recipients.variables` не только `1`, но и readable поля из `payload`:
  - company name;
  - email;
  - owns/manages BM;
  - BM ran ads before;
  - BM verified;
  - form name;
  - campaign/adset/ad name, если есть.

Это не обязательно попадёт в WhatsApp-шаблон, если шаблон использует только `{{1}}`, но эти данные будут доступны в recipient/message metadata и дальше их можно показать в Inbox/lead details.

### 6. Проверить отправку после фикса

После изменений:
- задеплоить `google-sheets-sync`, `lead-intake`, `lead-dispatch`, `campaigns`;
- вручную вызвать `lead-dispatch`;
- проверить, что:
  - новые recipients создаются один раз на лид;
  - `variables` содержит `1`;
  - ошибка `#131008` ушла;
  - `lead_imports` меняется с `pending/awaiting_manual` на `queued`;
  - `campaigns` после due-времени даёт либо `sent`, либо уже новую конкретную ошибку провайдера, если проблема будет не в переменных.

## Почему именно так

- `+91` решает только часть входных номеров.
- Текущий failed у Ankur происходит не из-за телефона, а из-за пустых template params.
- Пока не починить привязку `lead_imports -> campaign_recipients`, система будет повторно пытаться отправлять одному и тому же человеку.
- Ответы на вопросы уже есть в базе, нужно просто протащить их дальше в очередь/контекст.
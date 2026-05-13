## Что реально сломано

Slack показывает ответы из `slack_event_queue`, а Inbox сейчас грузит только последние 200 conversations по workspace.

По данным:
- Salesforge: 814 conversations, но Inbox берёт 200.
- goswyft: 915 conversations, один Slack lead сейчас на позиции 89 - виден.
- Salesforge последние Slack leads сейчас на позициях 1-4 - должны быть видны, но фильтры/поиск всё равно ненадёжные.
- Другие pipelines “работают” потому что либо меньше данных, либо нужные ответы попадают в первые 200.

Главная проблема: Inbox не умеет нормально искать/фильтровать весь workspace/pipeline. Он фильтрует только уже загруженные 200 строк. Поэтому ты видишь Slack-уведомление, заходишь искать в Inbox - и часть ответов физически не загружена в UI.

## План фикса

### 1. Сделать Inbox нормальным, а не “последние 200 и молись”

В `fetchCrmBase`:
- поднять initial load conversations с 200 до 1000 для workspace view;
- добавить `.limit(5000)` на служебные queries (`deals`, inbound messages), чтобы не упираться в дефолтный лимит 1000;
- `repliedConversationIds` считать не только по загруженным conversations, а по workspace/pipeline data, чтобы фильтр Replied не врал.

### 2. Добавить server-side lookup для Slack/search cases

В `src/lib/inbox.ts` добавить функцию поиска conversations по workspace:
- phone;
- contact_name;
- last_message_text;
- conversation id;
- pipeline filter;
- unread/replied filter.

В `CRM.tsx`:
- если пользователь вводит search и локальных результатов нет или мало - догружать matching conversations из базы;
- если включён `Replied`/`Unread`/pipeline filter - догружать не только из первых 200/1000, а matching rows из базы;
- новые найденные conversations добавлять в local state, чтобы клик открывал чат сразу.

Итог: если Slack пишет `+1415... btw your setup looks solid`, ты вставляешь телефон/имя/кусок текста - Inbox реально находит conversation, даже если она была не в первой пачке.

### 3. Починить фильтры как UX и как логику

Переделать верх фильтров Inbox:

```text
Search conversations
Numbers        Pipeline        Sort
All   Unread   Replied   Starred   Mine   Negative
```

- `All` реально сбрасывает все toggles, search, number, pipeline.
- Все pills в одном стиле, без зелёно-красно-жёлтой ёлки.
- `Replied` показывает conversations с inbound-сообщениями, а не только те, что случайно попали в initial batch.
- `Unread` показывает unread conversations по workspace/pipeline, а не только локально загруженные.
- `Negative` не прячет всё неожиданно: если включён - показывает lost-stage conversations, если выключен - скрывает lost как сейчас.

### 4. Добавить быстрый путь из Slack в Inbox

В Slack payload уже есть `conversation_id`. В UI уже поддерживается `?conversation=<id>` и Pipeline dialog тоже умеет `initialConversationId`.

Я сделаю стабильное поведение:
- при открытии `/workspace/.../inbox?conversation=<id>` Inbox напрямую fetch-ит conversation и messages, даже если conversation не в первой пачке;
- фильтры сбрасываются только для открытия конкретного чата;
- если чат из другого pipeline/недоступен текущему пользователю - показать понятный toast.

### 5. Backend webhook guard: Slack alert не должен расходиться с Inbox

В `whatsapp-webhook`:
- автоматизации сейчас берутся по `user_id`, без ограничения workspace/pipeline. Это риск cross-pipeline мусора.
- ограничить automations текущим `workspace_id` и target stage pipeline/current conversation pipeline.
- positive Slack alert отправлять только если conversation всё ещё имеет pipeline и deal stage совпадает с positive target.

Это уберёт случаи, где Slack уже сказал “positive”, а потом Inbox/Deal ушли в другой scope.

### 6. “Other Reply” отдельно

Я не буду больше чинить “пустую колонку”, потому ты уточнил: проблема не колонка, а то, что из Inbox нельзя найти ответы.

Но добавлю маленький guard в Pipeline: в `Other Reply` нельзя вручную перетащить deal без inbound message. Это защита от мусора, не основной фикс.

## Что изменю

- `src/lib/crmData.ts` - лимиты и корректные replied ids.
- `src/lib/inbox.ts` - server-side поиск/догрузка conversations.
- `src/pages/CRM.tsx` - рабочие фильтры, догрузка, новый дизайн фильтров.
- `src/pages/Pipeline.tsx` - guard для `Other Reply` без inbound.
- `supabase/functions/whatsapp-webhook/index.ts` - ограничение automations по workspace/pipeline.

## Как проверю

- По Salesforge: найти последние Slack contacts по телефону/имени/тексту.
- Включить `Replied` и `Unread` - список меняется и не становится пустым из-за локального лимита.
- Открыть Inbox с `?conversation=<recent Slack conversation id>` - чат открывается напрямую.
- Проверить, что pipeline filter не ломает поиск.

После одобрения внесу правки.
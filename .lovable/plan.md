## Что нашёл по двум проблемам

### Проблема 1: "Контакт пишет 1 раз, мы видим 2-3 раза" — баг дедупликации webhook

**Root cause найден.** Webhook `supabase/functions/whatsapp-webhook/index.ts` (строка 298) делает обычный `.insert()` входящего сообщения, **без проверки** что такой `provider_message_id` уже есть в базе. Gupshup ретраит доставку webhook (особенно на quick_reply кнопки `Block` / `Not for me`), и каждый ретрай создаёт новый дубль.

**Доказательство из БД (последние 3 дня в iskra):**
- 44 группы дублей входящих сообщений (всего 113 рядов вместо 44).
- Во всех дублях `provider_message_id` **идентичный**. Пример: convo `01c96c40...` — одно и то же сообщение `Block` с wamid `HBgMNDQ3NTY1...3NzgwMzc4NDYA` записано 3 раза (13:49:20, 13:49:27, 13:49:32 GST → это 17:49 Dubai).
- Ещё пример: `Ja gerne!` от того же контакта записано 3 раза в течение 18 секунд с одинаковым wamid.

Это объясняет почему в iskra инбоксе "многие отвечают по 2-3 раза" — на самом деле они пишут один раз, а дублирует наш webhook handler.

### Проблема 2: Сообщение видно в превью слева, но не отображается в чате

В скриншоте по Loni (`a7403ca6...`): последнее реальное сообщение в БД — `"Möchtest du mit deinem Fitnesscoaching nebenbei..."` отправлено сеттером в 18:38:38 Dubai (14:38:38 UTC). Превью слева в сайдбаре его показывает (`last_message_text` обновился), но в открытом чате этого пузыря нет — обведённое красным пустое место там, где он должен был отрисоваться.

Realtime-подписка в `CRM.tsx` (строки 395-419) подписана корректно: `event: "*"`, фильтр `conversation_id=eq.${activeId}`, INSERT добавляет сообщение в `setMessages`. То есть код правильный, но событие не доходит до клиента. Возможные причины:

1. **Realtime postgres_changes фильтруется RLS:** событие INSERT доходит только тем клиентам, чей JWT проходит SELECT-политику на messages. Если сеттер отправляет сообщение под `user_id = owner_workspace`, а смотрит чат другой member workspace, RLS может тихо отфильтровать событие.
2. **Канал realtime отвалился:** WebSocket к Supabase отключается после простоя/смены сети, мы не переподписываемся.
3. **Refetch при возврате фокуса отсутствует:** даже когда `conversations.last_message_at` обновляется в сайдбаре, мы не реакаемся для активного чата.

## План фиксов

### A. Дедупликация входящих в webhook (Проблема 1) — критичный фикс

Файл `supabase/functions/whatsapp-webhook/index.ts`:

1. **Перед вставкой inbound message** (~строка 298) проверять `SELECT id FROM messages WHERE provider_message_id = ? LIMIT 1`. Если ряд уже есть — `return` (не вставлять, не обновлять `conversation.last_message_text`, не слать Slack, не триггерить classify-replies).
2. **Опционально, для надёжности**: добавить partial unique index в миграции:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS messages_provider_message_id_uniq
     ON public.messages (provider_message_id)
     WHERE provider_message_id IS NOT NULL;
   ```
   Это страхует на случай гонки между параллельными webhook-вызовами Gupshup.
3. **Чистка существующих дублей** (44 группы) — отдельной разовой миграцией: оставить самую раннюю строку в каждой группе `(provider_message_id)`, остальные удалить. Перед удалением — пересчитать `conversations.last_message_text` / `last_message_at` если они ссылались на удалённый ряд (хотя они хранят текст, а не FK).

### B. Подтянуть пропавшее сообщение в открытом чате (Проблема 2)

Файл `src/pages/CRM.tsx`:

1. **Fallback refetch при обновлении `last_message_at` для активного чата.** В realtime-обработчике `conversations` (уже подписан) — если `payload.new.id === activeId` и `payload.new.last_message_at` новее времени последнего сообщения в `messages[]`, дёргать `fetchConversationMessages(activeId)` и мерджить.
2. **Refetch при возврате фокуса вкладки** (`visibilitychange` → если есть `activeId`, перезагрузить сообщения).
3. **Логировать `subscribe` callback** в `useRealtimeTable` (статусы `SUBSCRIBED`/`CHANNEL_ERROR`/`CLOSED`) — чтобы диагностировать, отвалился ли канал.
4. **Проверить RLS на `messages`** в БД: убедиться, что все workspace members могут `SELECT` сообщения в чатах своего workspace (не только `user_id = auth.uid()`). Если политика слишком узкая — расширить.

### C. Диагностика и тесты

- После фикса A прогнать тот же запрос на дубли — должно быть 0 групп новых дублей за следующий час.
- Проверить convo `01c96c40-5f1a-4e1c-9b73-de02df7c62fc` после чистки — должно остаться по 1 ряду каждого wamid.
- Открыть Loni-подобный чат в двух вкладках, отправить сообщение из одной — убедиться что во второй вкладке оно появляется без рефреша.

## Порядок работ

1. Сначала **A1+A2** (webhook idempotency + unique index) — останавливает кровотечение с новыми дублями.
2. Потом **A3** (чистка существующих дублей в iskra) — отдельная миграция, согласовать с тобой перед запуском.
3. Параллельно **B1+B2** — фронтенд-фолбек, чтобы пропавшие сообщения дотягивались refetch-ом.
4. **B3+B4** — диагностика, при необходимости миграция RLS.

## Технические детали (для разработчика)

- Webhook сейчас не различает `message` vs `message-event` для дедупа — нужно дедуплить только `type: "message"` (inbound) по `provider_message_id`. События `message-event` (статусы delivered/read) обрабатываются отдельной веткой и там dedup уже не критичен.
- Unique index на `provider_message_id` затронет и outbound (там тоже хранится wamid от Gupshup) — нужно проверить, что в outbound нет коллизий. Если есть — сделать индекс `WHERE direction = 'inbound'`.
- Чистку дублей делать в транзакции с `ROW_NUMBER() OVER (PARTITION BY provider_message_id ORDER BY created_at) > 1 → DELETE`.

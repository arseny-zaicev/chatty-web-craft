## Что строим
На странице пайплайна (PipelineConfigSheet) - новая секция **Zapier webhook**. Менеджер вставляет URL вида `https://hooks.zapier.com/hooks/catch/...`, и при любой смене стадии сделки в этом пайплайне мы автоматически POST-им JSON-payload на этот URL. Триггер - сама БД (trigger + pg_net), без правок клиентского кода. Затраты на токены нулевые.

## БД (одна миграция)

```sql
-- 1. Поле для URL на пайплайне
ALTER TABLE public.pipelines
  ADD COLUMN zapier_webhook_url text;

-- 2. Лог отправок (для отладки и retry)
CREATE TABLE public.pipeline_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  deal_id uuid,
  event_type text NOT NULL,         -- 'deal.stage_changed'
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending|sent|failed
  response_status int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE public.pipeline_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view deliveries" ON public.pipeline_webhook_deliveries
  FOR SELECT TO authenticated
  USING (is_workspace_manager(workspace_id, auth.uid()));

-- 3. Триггер на смену стадии
CREATE OR REPLACE FUNCTION public.enqueue_pipeline_webhook_on_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_url text;
  v_pipeline_id uuid;
  v_old_stage record;
  v_new_stage record;
BEGIN
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;
  SELECT pipeline_id INTO v_pipeline_id FROM pipeline_stages WHERE id = NEW.stage_id;
  IF v_pipeline_id IS NULL THEN RETURN NEW; END IF;
  SELECT zapier_webhook_url INTO v_url FROM pipelines WHERE id = v_pipeline_id;
  IF v_url IS NULL OR length(v_url) < 10 THEN RETURN NEW; END IF;
  SELECT id, name, stage_type INTO v_new_stage FROM pipeline_stages WHERE id = NEW.stage_id;
  SELECT id, name, stage_type INTO v_old_stage FROM pipeline_stages WHERE id = OLD.stage_id;

  INSERT INTO pipeline_webhook_deliveries (pipeline_id, workspace_id, deal_id, event_type, payload)
  VALUES (
    v_pipeline_id, NEW.workspace_id, NEW.id, 'deal.stage_changed',
    jsonb_build_object(
      'event', 'deal.stage_changed',
      'occurred_at', now(),
      'pipeline_id', v_pipeline_id,
      'deal', jsonb_build_object(
        'id', NEW.id, 'title', NEW.title,
        'contact_name', NEW.contact_name, 'contact_phone', NEW.contact_phone,
        'amount', NEW.amount, 'currency', NEW.currency,
        'conversation_id', NEW.conversation_id
      ),
      'from_stage', jsonb_build_object('id', v_old_stage.id, 'name', v_old_stage.name, 'type', v_old_stage.stage_type),
      'to_stage',   jsonb_build_object('id', v_new_stage.id, 'name', v_new_stage.name, 'type', v_new_stage.stage_type)
    )
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_deal_stage_change_webhook
AFTER UPDATE OF stage_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.enqueue_pipeline_webhook_on_stage_change();
```

## Edge function `dispatch-pipeline-webhooks`
- Берёт из `pipeline_webhook_deliveries` все `status='pending'`, по каждой POST-ит payload на `pipelines.zapier_webhook_url`, фиксирует `sent`/`failed` + `response_status`.
- `verify_jwt = false`, вызывается cron'ом каждую минуту через `pg_net.http_post`.
- При 4xx (особенно 410 - Zapier удалил Zap) - помечаем `failed`, не ретраим. При 5xx/timeout - оставляем `pending` (повторим), максимум 5 попыток.

## Cron
```sql
SELECT cron.schedule('dispatch-pipeline-webhooks', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/dispatch-pipeline-webhooks',
    headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```
(применяется через insert-tool с настоящим anon key, не миграцией)

## UI - `PipelineConfigSheet.tsx`
Новый блок **"Zapier webhook"**:
- Input "Webhook URL" (placeholder: `https://hooks.zapier.com/hooks/catch/…`)
- Кнопка **"Send test"** - дёргает новую функцию `test-pipeline-webhook` с фейковым payload, показывает HTTP-статус.
- Маленькая ссылка "Last 10 deliveries" - открывает popover с последними записями из `pipeline_webhook_deliveries` (статус, ответ, время в GST).
- Подсказка: "Triggers on every stage change for deals in this pipeline. Set up a 'Catch Hook' trigger in Zapier and copy the URL here."

## Безопасность
- URL виден только менеджерам workspace (как и все настройки пайплайна).
- Доменный allowlist в edge-функции: `hooks.zapier.com`, `hook.eu1.make.com`, `hook.us1.make.com` (Make тоже подходит). Любой другой хост - отказываем с понятной ошибкой в UI.
- В payload **не** включаем `body` сообщений, только метаданные сделки + стадии.

## Что НЕ делаем сейчас
- Не делаем deal.created/won/lost - пользователь выбрал "любая смена стадии" (won/lost будут видны через `to_stage.type`).
- Не делаем inbound (FB Lead Ads -> наш пайплайн) - откажемся отдельно, если попросит.
- Не подключаем FB CAPI напрямую - Zapier этим занимается.

## Файлы
- миграция (создание поля, таблицы, функции, триггера)
- `supabase/functions/dispatch-pipeline-webhooks/index.ts`
- `supabase/functions/test-pipeline-webhook/index.ts`
- `src/components/workspace/PipelineConfigSheet.tsx` (новый блок Zapier)
- insert-tool: cron schedule

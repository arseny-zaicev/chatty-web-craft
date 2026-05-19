ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS zapier_webhook_url text;

CREATE TABLE IF NOT EXISTS public.pipeline_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  deal_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  response_status int,
  response_body text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pw_deliveries_pipeline_created
  ON public.pipeline_webhook_deliveries (pipeline_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pw_deliveries_pending
  ON public.pipeline_webhook_deliveries (created_at)
  WHERE status = 'pending';

ALTER TABLE public.pipeline_webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view deliveries" ON public.pipeline_webhook_deliveries;
CREATE POLICY "Managers view deliveries" ON public.pipeline_webhook_deliveries
  FOR SELECT TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Service manages deliveries" ON public.pipeline_webhook_deliveries;
CREATE POLICY "Service manages deliveries" ON public.pipeline_webhook_deliveries
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.enqueue_pipeline_webhook_on_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_pipeline_id uuid;
  v_old_stage record;
  v_new_stage record;
BEGIN
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT pipeline_id INTO v_pipeline_id FROM pipeline_stages WHERE id = NEW.stage_id;
  IF v_pipeline_id IS NULL THEN RETURN NEW; END IF;

  SELECT zapier_webhook_url INTO v_url FROM pipelines WHERE id = v_pipeline_id;
  IF v_url IS NULL OR length(v_url) < 10 THEN RETURN NEW; END IF;

  SELECT id, name, stage_type INTO v_new_stage FROM pipeline_stages WHERE id = NEW.stage_id;
  SELECT id, name, stage_type INTO v_old_stage FROM pipeline_stages WHERE id = OLD.stage_id;

  INSERT INTO public.pipeline_webhook_deliveries
    (pipeline_id, workspace_id, deal_id, event_type, payload)
  VALUES (
    v_pipeline_id, NEW.workspace_id, NEW.id, 'deal.stage_changed',
    jsonb_build_object(
      'event', 'deal.stage_changed',
      'occurred_at', now(),
      'pipeline_id', v_pipeline_id,
      'workspace_id', NEW.workspace_id,
      'deal', jsonb_build_object(
        'id', NEW.id,
        'title', NEW.title,
        'contact_name', NEW.contact_name,
        'contact_phone', NEW.contact_phone,
        'amount', NEW.amount,
        'currency', NEW.currency,
        'conversation_id', NEW.conversation_id
      ),
      'from_stage', jsonb_build_object('id', v_old_stage.id, 'name', v_old_stage.name, 'type', v_old_stage.stage_type),
      'to_stage',   jsonb_build_object('id', v_new_stage.id, 'name', v_new_stage.name, 'type', v_new_stage.stage_type)
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deal_stage_change_webhook ON public.deals;
CREATE TRIGGER trg_deal_stage_change_webhook
AFTER UPDATE OF stage_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.enqueue_pipeline_webhook_on_stage_change();
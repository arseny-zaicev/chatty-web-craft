
ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS expected_country_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS failed_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipelines_failed_stage ON public.pipelines(failed_stage_id) WHERE failed_stage_id IS NOT NULL;

-- Trigger: move deal to failed_stage_id when campaign_recipient flips to failed.
CREATE OR REPLACE FUNCTION public.move_deal_on_recipient_failed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _failed_stage uuid;
  _deal_id uuid;
  _err text;
BEGIN
  IF NEW.status::text <> 'failed' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  -- Find pipeline via campaign
  SELECT pipeline_id INTO _pid FROM public.campaigns WHERE id = NEW.campaign_id;
  IF _pid IS NULL THEN RETURN NEW; END IF;

  SELECT failed_stage_id INTO _failed_stage FROM public.pipelines WHERE id = _pid;
  IF _failed_stage IS NULL THEN RETURN NEW; END IF;

  -- Locate deal via lead_imports or conversation
  SELECT deal_id INTO _deal_id FROM public.lead_imports
    WHERE campaign_recipient_id = NEW.id LIMIT 1;
  IF _deal_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT id INTO _deal_id FROM public.deals
      WHERE conversation_id = NEW.conversation_id LIMIT 1;
  END IF;
  IF _deal_id IS NULL THEN RETURN NEW; END IF;

  _err := COALESCE(NULLIF(NEW.error_message, ''), 'WhatsApp delivery failed');

  UPDATE public.deals
    SET stage_id = _failed_stage,
        notes = CASE
          WHEN notes IS NULL OR notes = '' THEN 'Auto-moved: ' || _err
          ELSE notes || E'\n\nAuto-moved: ' || _err
        END,
        updated_at = now()
    WHERE id = _deal_id
      AND stage_id IS DISTINCT FROM _failed_stage;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_move_deal_on_recipient_failed ON public.campaign_recipients;
CREATE TRIGGER trg_move_deal_on_recipient_failed
  AFTER UPDATE OF status ON public.campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.move_deal_on_recipient_failed();

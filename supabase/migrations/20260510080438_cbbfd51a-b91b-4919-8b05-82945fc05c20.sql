
-- Sync deals.pipeline_id from stage on insert/update
CREATE OR REPLACE FUNCTION public.sync_deal_pipeline_from_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _pid uuid;
BEGIN
  SELECT pipeline_id INTO _pid FROM public.pipeline_stages WHERE id = NEW.stage_id;
  IF _pid IS NOT NULL THEN
    NEW.pipeline_id := _pid;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deals_sync_pipeline ON public.deals;
CREATE TRIGGER trg_deals_sync_pipeline
BEFORE INSERT OR UPDATE OF stage_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.sync_deal_pipeline_from_stage();

-- When deal's pipeline changes, propagate to its conversation
CREATE OR REPLACE FUNCTION public.propagate_deal_pipeline_to_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND NEW.pipeline_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id) THEN
    UPDATE public.conversations
    SET pipeline_id = NEW.pipeline_id
    WHERE id = NEW.conversation_id
      AND (pipeline_id IS DISTINCT FROM NEW.pipeline_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deals_propagate_pipeline ON public.deals;
CREATE TRIGGER trg_deals_propagate_pipeline
AFTER INSERT OR UPDATE OF pipeline_id, conversation_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.propagate_deal_pipeline_to_conversation();

-- When a campaign_recipient gets a conversation_id, copy campaign.pipeline_id onto the conversation
CREATE OR REPLACE FUNCTION public.propagate_campaign_pipeline_to_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _pid uuid;
BEGIN
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;
  SELECT pipeline_id INTO _pid FROM public.campaigns WHERE id = NEW.campaign_id;
  IF _pid IS NULL THEN RETURN NEW; END IF;
  UPDATE public.conversations
  SET pipeline_id = _pid
  WHERE id = NEW.conversation_id
    AND pipeline_id IS NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recipients_propagate_pipeline ON public.campaign_recipients;
CREATE TRIGGER trg_recipients_propagate_pipeline
AFTER INSERT OR UPDATE OF conversation_id ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.propagate_campaign_pipeline_to_conversation();

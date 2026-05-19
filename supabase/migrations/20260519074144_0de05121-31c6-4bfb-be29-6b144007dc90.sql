-- 1) Cascade trigger: campaign_recipients.failed -> lead_imports.failed
CREATE OR REPLACE FUNCTION public.sync_lead_import_status_from_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'failed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.lead_imports
       SET status = 'failed',
           error  = COALESCE(NULLIF(NEW.error_message, ''), 'recipient marked failed')
     WHERE campaign_recipient_id = NEW.id
       AND status IN ('queued','sent');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_lead_import_status_from_recipient ON public.campaign_recipients;
CREATE TRIGGER trg_sync_lead_import_status_from_recipient
AFTER UPDATE OF status ON public.campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_import_status_from_recipient();

-- 2) RPC to purge pending leads tied to a disconnected source
CREATE OR REPLACE FUNCTION public.purge_pending_leads_for_source(_source_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid; _count int;
BEGIN
  SELECT workspace_id INTO _ws FROM public.source_connections WHERE id = _source_id;
  IF _ws IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_workspace_manager(_ws, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  WITH upd AS (
    UPDATE public.lead_imports
       SET status = 'skipped',
           error  = 'source_disconnected'
     WHERE source_connection_id = _source_id
       AND status IN ('pending','awaiting_manual','queued')
    RETURNING 1
  )
  SELECT COUNT(*) INTO _count FROM upd;
  RETURN _count;
END $$;

-- 3) Index for the new dispatch query
CREATE INDEX IF NOT EXISTS idx_lead_imports_pipeline_status_source
  ON public.lead_imports (pipeline_id, status, source_connection_id);

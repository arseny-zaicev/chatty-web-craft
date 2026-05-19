CREATE OR REPLACE FUNCTION public.guard_lead_imports_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE ok boolean := false;
BEGIN
  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    RAISE EXCEPTION 'lead_imports.pipeline_id is immutable';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  ok := CASE OLD.status
    WHEN 'pending'          THEN NEW.status IN ('queued','skipped','invalid','duplicate','awaiting_manual')
    WHEN 'awaiting_manual'  THEN NEW.status IN ('queued','skipped','sent','replied','failed','duplicate')
    WHEN 'queued'           THEN NEW.status IN ('sent','failed','skipped','pending')
    WHEN 'sent'             THEN NEW.status IN ('replied','failed')
    WHEN 'replied'          THEN false
    WHEN 'failed'           THEN NEW.status IN ('queued','pending','awaiting_manual')
    WHEN 'skipped'          THEN NEW.status IN ('queued','pending','awaiting_manual')
    WHEN 'invalid'          THEN NEW.status IN ('awaiting_manual')
    WHEN 'duplicate'        THEN NEW.status IN ('awaiting_manual')
    ELSE true
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'Illegal lead_imports status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END
$function$;
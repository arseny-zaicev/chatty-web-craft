
-- 1. Trigger: auto-create a deal in pipeline.failed_stage_id when a lead_import
--    becomes unsendable (awaiting_manual / invalid / failed) and has no deal yet.
CREATE OR REPLACE FUNCTION public.lead_import_create_failed_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_stage uuid;
  v_pipeline_user uuid;
  v_title text;
  v_name text;
  v_deal_id uuid;
  v_reason text;
BEGIN
  IF NEW.status NOT IN ('awaiting_manual', 'invalid', 'failed') THEN
    RETURN NEW;
  END IF;
  IF NEW.deal_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT failed_stage_id, user_id INTO v_failed_stage, v_pipeline_user
  FROM pipelines WHERE id = NEW.pipeline_id;

  IF v_failed_stage IS NULL THEN
    RETURN NEW;
  END IF;

  v_name := NULLIF(trim(COALESCE(NEW.payload->>'first_name', NEW.payload->>'name', '')), '');
  v_title := COALESCE(v_name, '+' || NEW.phone);
  v_reason := CASE NEW.status
    WHEN 'awaiting_manual' THEN 'Phone needs review'
    WHEN 'invalid' THEN 'Invalid phone'
    WHEN 'failed' THEN 'Send failed'
  END;

  INSERT INTO deals (
    workspace_id, pipeline_id, stage_id, user_id,
    title, contact_name, contact_phone, notes, position
  ) VALUES (
    NEW.workspace_id, NEW.pipeline_id, v_failed_stage, v_pipeline_user,
    v_title, v_name, NEW.phone,
    v_reason || COALESCE(E'\n' || NEW.error, ''),
    0
  )
  RETURNING id INTO v_deal_id;

  UPDATE lead_imports SET deal_id = v_deal_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_import_create_failed_deal ON lead_imports;
CREATE TRIGGER trg_lead_import_create_failed_deal
AFTER INSERT OR UPDATE OF status ON lead_imports
FOR EACH ROW EXECUTE FUNCTION public.lead_import_create_failed_deal();

-- 2. RPC: retry a failed lead with optionally corrected phone.
--    Resets status to pending, clears error, deletes the holding deal so
--    the dispatcher creates a fresh deal/conversation on next send.
CREATE OR REPLACE FUNCTION public.retry_lead_import(
  p_lead_id uuid,
  p_new_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid;
  v_pipeline uuid;
  v_deal_id uuid;
  v_phone text;
BEGIN
  SELECT workspace_id, pipeline_id, deal_id INTO v_workspace, v_pipeline, v_deal_id
  FROM lead_imports WHERE id = p_lead_id;

  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  IF NOT is_workspace_member(v_workspace, auth.uid())
     OR NOT can_access_pipeline(v_workspace, auth.uid(), v_pipeline) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_phone := NULLIF(regexp_replace(COALESCE(p_new_phone, ''), '\D', '', 'g'), '');

  UPDATE lead_imports
  SET phone = COALESCE(v_phone, phone),
      status = 'pending',
      error = NULL,
      campaign_recipient_id = NULL,
      campaign_id = NULL,
      scheduled_at = NULL,
      sent_at = NULL,
      deal_id = NULL,
      conversation_id = NULL
  WHERE id = p_lead_id;

  IF v_deal_id IS NOT NULL THEN
    DELETE FROM deals WHERE id = v_deal_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_lead_import(uuid, text) TO authenticated;

-- 3. Backfill: create failed-stage cards for existing stuck leads.
INSERT INTO deals (workspace_id, pipeline_id, stage_id, user_id, title, contact_name, contact_phone, notes, position)
SELECT
  li.workspace_id, li.pipeline_id, p.failed_stage_id, p.user_id,
  COALESCE(NULLIF(trim(COALESCE(li.payload->>'first_name', li.payload->>'name', '')), ''), '+' || li.phone),
  NULLIF(trim(COALESCE(li.payload->>'first_name', li.payload->>'name', '')), ''),
  li.phone,
  CASE li.status WHEN 'awaiting_manual' THEN 'Phone needs review' WHEN 'invalid' THEN 'Invalid phone' WHEN 'failed' THEN 'Send failed' END
    || COALESCE(E'\n' || li.error, ''),
  0
FROM lead_imports li
JOIN pipelines p ON p.id = li.pipeline_id
WHERE li.status IN ('awaiting_manual', 'invalid', 'failed')
  AND li.deal_id IS NULL
  AND p.failed_stage_id IS NOT NULL;

-- Link the freshly created deals back to lead_imports
UPDATE lead_imports li
SET deal_id = d.id
FROM deals d
WHERE li.deal_id IS NULL
  AND li.status IN ('awaiting_manual', 'invalid', 'failed')
  AND d.workspace_id = li.workspace_id
  AND d.pipeline_id = li.pipeline_id
  AND d.contact_phone = li.phone
  AND d.created_at > now() - interval '5 minutes';

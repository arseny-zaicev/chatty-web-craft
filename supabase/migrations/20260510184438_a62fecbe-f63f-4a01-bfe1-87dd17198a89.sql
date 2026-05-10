
-- 1. Heartbeats table for cron self-monitoring
CREATE TABLE IF NOT EXISTS public.system_heartbeats (
  name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.system_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service manages heartbeats"
  ON public.system_heartbeats FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admins read heartbeats"
  ON public.system_heartbeats FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. Inbound pipeline routing safety trigger
CREATE OR REPLACE FUNCTION public.fill_inbound_conversation_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv_pid uuid;
  _conv_phone text;
  _conv_ws uuid;
  _resolved_pid uuid;
BEGIN
  IF NEW.direction::text <> 'inbound' THEN
    RETURN NEW;
  END IF;

  SELECT pipeline_id, contact_phone, workspace_id
    INTO _conv_pid, _conv_phone, _conv_ws
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF _conv_pid IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Look for the most recent campaign_recipient for this phone in this workspace
  SELECT c.pipeline_id INTO _resolved_pid
  FROM public.campaign_recipients cr
  JOIN public.campaigns c ON c.id = cr.campaign_id
  WHERE cr.contact_phone = _conv_phone
    AND cr.workspace_id = _conv_ws
    AND c.pipeline_id IS NOT NULL
  ORDER BY cr.created_at DESC
  LIMIT 1;

  IF _resolved_pid IS NOT NULL THEN
    UPDATE public.conversations SET pipeline_id = _resolved_pid WHERE id = NEW.conversation_id AND pipeline_id IS NULL;
    UPDATE public.deals SET pipeline_id = _resolved_pid WHERE conversation_id = NEW.conversation_id AND pipeline_id IS NULL;
    UPDATE public.campaign_recipients SET pipeline_id = _resolved_pid
      WHERE contact_phone = _conv_phone AND workspace_id = _conv_ws AND pipeline_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_inbound_pipeline ON public.messages;
CREATE TRIGGER trg_fill_inbound_pipeline
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_inbound_conversation_pipeline();

-- 3. Backfill: conversations with NULL pipeline that DO have a campaign recipient
UPDATE public.conversations c
SET pipeline_id = sub.pipeline_id
FROM (
  SELECT DISTINCT ON (cr.contact_phone, cr.workspace_id)
    cr.contact_phone, cr.workspace_id, ca.pipeline_id
  FROM public.campaign_recipients cr
  JOIN public.campaigns ca ON ca.id = cr.campaign_id
  WHERE ca.pipeline_id IS NOT NULL
  ORDER BY cr.contact_phone, cr.workspace_id, cr.created_at DESC
) sub
WHERE c.pipeline_id IS NULL
  AND c.contact_phone = sub.contact_phone
  AND c.workspace_id = sub.workspace_id;

-- And propagate to deals
UPDATE public.deals d
SET pipeline_id = c.pipeline_id
FROM public.conversations c
WHERE d.conversation_id = c.id
  AND d.pipeline_id IS NULL
  AND c.pipeline_id IS NOT NULL;

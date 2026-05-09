-- Backfill deals.workspace_id from conversations and ensure future deals carry it
UPDATE public.deals d
SET workspace_id = c.workspace_id
FROM public.conversations c
WHERE d.conversation_id = c.id
  AND d.workspace_id IS NULL
  AND c.workspace_id IS NOT NULL;

-- Also backfill stages.workspace_id where missing (so RLS workspace policy sees them)
UPDATE public.pipeline_stages s
SET workspace_id = w.id
FROM public.workspaces w
WHERE s.workspace_id IS NULL
  AND s.user_id = w.owner_user_id;

CREATE OR REPLACE FUNCTION public.ensure_deal_for_conversation(_conversation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _conv public.conversations%ROWTYPE;
  _stage_id uuid;
  _deal_id uuid;
  _position integer;
BEGIN
  SELECT * INTO _conv FROM public.conversations WHERE id = _conversation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO _deal_id FROM public.deals WHERE conversation_id = _conversation_id LIMIT 1;
  IF _deal_id IS NOT NULL THEN
    UPDATE public.deals SET workspace_id = COALESCE(workspace_id, _conv.workspace_id) WHERE id = _deal_id;
    RETURN _deal_id;
  END IF;

  -- Prefer a stage in the same workspace, else fall back to user's first stage
  SELECT id INTO _stage_id
  FROM public.pipeline_stages
  WHERE workspace_id = _conv.workspace_id
  ORDER BY position ASC, created_at ASC
  LIMIT 1;

  IF _stage_id IS NULL THEN
    _stage_id := public.ensure_pipeline_stage(_conv.user_id);
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO _position
  FROM public.deals
  WHERE stage_id = _stage_id;

  INSERT INTO public.deals (
    user_id, workspace_id, conversation_id, stage_id, title, contact_name, contact_phone, position
  ) VALUES (
    _conv.user_id, _conv.workspace_id, _conv.id, _stage_id,
    COALESCE(NULLIF(_conv.contact_name, ''), '+' || _conv.contact_phone),
    _conv.contact_name, _conv.contact_phone, _position
  )
  ON CONFLICT (conversation_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    updated_at = now()
  RETURNING id INTO _deal_id;

  RETURN _deal_id;
END;
$function$;
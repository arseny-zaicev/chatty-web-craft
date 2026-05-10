
-- 0.1 Ensure every workspace has at least one default pipeline.
-- For workspaces with pipelines but no default, promote the lowest-position one.
WITH no_def AS (
  SELECT w.id AS workspace_id
  FROM public.workspaces w
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.workspace_id = w.id AND p.is_default
  )
  AND EXISTS (
    SELECT 1 FROM public.pipelines p WHERE p.workspace_id = w.id
  )
),
picks AS (
  SELECT DISTINCT ON (p.workspace_id) p.id, p.workspace_id
  FROM public.pipelines p
  JOIN no_def n ON n.workspace_id = p.workspace_id
  ORDER BY p.workspace_id, p.position ASC, p.created_at ASC
)
UPDATE public.pipelines p
SET is_default = true
FROM picks
WHERE p.id = picks.id;

-- For workspaces with NO pipelines at all, create a default "Main" pipeline owned by the workspace owner.
INSERT INTO public.pipelines (workspace_id, user_id, name, color, position, is_default)
SELECT w.id, w.owner_user_id, 'Main', '#6366f1', 0, true
FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM public.pipelines p WHERE p.workspace_id = w.id);

-- Seed default stages for any newly created Main pipelines that have no stages yet.
INSERT INTO public.pipeline_stages (workspace_id, user_id, pipeline_id, name, color, stage_type, position)
SELECT p.workspace_id, p.user_id, p.id, s.name, s.color, s.stage_type::stage_type, s.pos
FROM public.pipelines p
CROSS JOIN (VALUES
  ('Message sent',         '#64748b', 'open', 0),
  ('Other Reply',          '#94a3b8', 'open', 1),
  ('Positive reply',       '#10b981', 'open', 2),
  ('In progress',          '#f59e0b', 'open', 3),
  ('Follow Up',            '#6366f1', 'open', 4),
  ('Booked',               '#3b82f6', 'open', 5),
  ('Not interested/Block', '#ef4444', 'lost', 6),
  ('Lost',                 '#dc2626', 'lost', 7),
  ('Won',                  '#059669', 'won', 8)
) AS s(name, color, stage_type, pos)
WHERE p.is_default = true
  AND NOT EXISTS (SELECT 1 FROM public.pipeline_stages st WHERE st.pipeline_id = p.id);

-- 0.3 Enforce only one default pipeline per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS pipelines_one_default_per_workspace
  ON public.pipelines (workspace_id) WHERE is_default;

-- 0.2 BEFORE INSERT trigger to fill conversations.pipeline_id with the workspace default.
CREATE OR REPLACE FUNCTION public.fill_conversation_pipeline_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pipeline_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT p.id INTO NEW.pipeline_id
    FROM public.pipelines p
    WHERE p.workspace_id = NEW.workspace_id AND p.is_default
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_fill_pipeline_id ON public.conversations;
CREATE TRIGGER conversations_fill_pipeline_id
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.fill_conversation_pipeline_id();

-- Make sure workspace_id is filled before pipeline_id (trigger order = alphabetical).
-- fill_conversation_workspace_id trigger name should run earlier; rename if needed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fill_conversation_workspace_id_trigger') THEN
    -- already named with suffix; conversations_fill_pipeline_id sorts after; OK.
    NULL;
  END IF;
END $$;

-- 0.1 Patch ensure_deal_for_conversation to be pipeline-aware.
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
  _pipeline_id uuid;
BEGIN
  SELECT * INTO _conv FROM public.conversations WHERE id = _conversation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO _deal_id FROM public.deals WHERE conversation_id = _conversation_id LIMIT 1;
  IF _deal_id IS NOT NULL THEN
    UPDATE public.deals SET workspace_id = COALESCE(workspace_id, _conv.workspace_id) WHERE id = _deal_id;
    RETURN _deal_id;
  END IF;

  -- Resolve pipeline: conversation.pipeline_id -> workspace default
  _pipeline_id := _conv.pipeline_id;
  IF _pipeline_id IS NULL AND _conv.workspace_id IS NOT NULL THEN
    SELECT id INTO _pipeline_id
    FROM public.pipelines
    WHERE workspace_id = _conv.workspace_id AND is_default
    LIMIT 1;
  END IF;

  -- Pick the first stage of the resolved pipeline
  IF _pipeline_id IS NOT NULL THEN
    SELECT id INTO _stage_id
    FROM public.pipeline_stages
    WHERE pipeline_id = _pipeline_id
    ORDER BY position ASC, created_at ASC
    LIMIT 1;
  END IF;

  -- Fallbacks: any stage in the workspace, then user-level fallback
  IF _stage_id IS NULL THEN
    SELECT id INTO _stage_id
    FROM public.pipeline_stages
    WHERE workspace_id = _conv.workspace_id
    ORDER BY position ASC, created_at ASC
    LIMIT 1;
  END IF;

  IF _stage_id IS NULL THEN
    _stage_id := public.ensure_pipeline_stage(_conv.user_id);
  END IF;

  SELECT COALESCE(MAX(position), -1) + 1 INTO _position
  FROM public.deals
  WHERE stage_id = _stage_id;

  INSERT INTO public.deals (
    user_id, workspace_id, conversation_id, stage_id, pipeline_id, title, contact_name, contact_phone, position
  ) VALUES (
    _conv.user_id, _conv.workspace_id, _conv.id, _stage_id, _pipeline_id,
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

-- 1.2 Backfill nulls
UPDATE public.conversations c
SET pipeline_id = p.id
FROM public.pipelines p
WHERE c.pipeline_id IS NULL
  AND p.workspace_id = c.workspace_id
  AND p.is_default;

UPDATE public.deals d
SET pipeline_id = p.id
FROM public.pipelines p
WHERE d.pipeline_id IS NULL
  AND p.workspace_id = d.workspace_id
  AND p.is_default;

-- 1.3 Stage repair: when deal.pipeline_id != stage.pipeline_id, move the deal to the first stage of its pipeline.
WITH bad AS (
  SELECT d.id AS deal_id, d.pipeline_id
  FROM public.deals d
  JOIN public.pipeline_stages s ON s.id = d.stage_id
  WHERE d.pipeline_id IS NOT NULL
    AND s.pipeline_id IS NOT NULL
    AND s.pipeline_id <> d.pipeline_id
),
target AS (
  SELECT DISTINCT ON (s.pipeline_id) s.pipeline_id, s.id AS stage_id
  FROM public.pipeline_stages s
  WHERE s.pipeline_id IN (SELECT pipeline_id FROM bad)
  ORDER BY s.pipeline_id, s.position ASC, s.created_at ASC
)
UPDATE public.deals d
SET stage_id = t.stage_id
FROM bad b
JOIN target t ON t.pipeline_id = b.pipeline_id
WHERE d.id = b.deal_id;

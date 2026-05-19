
-- 1. workspace_setters table
CREATE TABLE public.workspace_setters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  external boolean NOT NULL DEFAULT false,
  linked_user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, linked_user_id)
);

CREATE INDEX idx_workspace_setters_workspace ON public.workspace_setters(workspace_id) WHERE is_active;
CREATE INDEX idx_workspace_setters_user ON public.workspace_setters(linked_user_id) WHERE linked_user_id IS NOT NULL;

CREATE TRIGGER trg_workspace_setters_updated
  BEFORE UPDATE ON public.workspace_setters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workspace_setters ENABLE ROW LEVEL SECURITY;

-- Anyone in the workspace can see setters (need this for dropdowns)
CREATE POLICY "Workspace members can view setters"
  ON public.workspace_setters FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Managers can insert setters"
  ON public.workspace_setters FOR INSERT
  WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Managers can update setters"
  ON public.workspace_setters FOR UPDATE
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Managers can delete setters"
  ON public.workspace_setters FOR DELETE
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

-- 2. assigned_setter_id on conversations
ALTER TABLE public.conversations
  ADD COLUMN assigned_setter_id uuid REFERENCES public.workspace_setters(id) ON DELETE SET NULL;

CREATE INDEX idx_conversations_assigned_setter ON public.conversations(assigned_setter_id) WHERE assigned_setter_id IS NOT NULL;

-- Sync trigger: when setter is assigned, also fill assigned_user_id and assigned_at
CREATE OR REPLACE FUNCTION public.sync_assigned_user_from_setter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _linked uuid;
BEGIN
  IF NEW.assigned_setter_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_setter_id IS DISTINCT FROM OLD.assigned_setter_id) THEN
    SELECT linked_user_id INTO _linked
      FROM public.workspace_setters
      WHERE id = NEW.assigned_setter_id;
    NEW.assigned_user_id := _linked; -- nullable if external setter
    NEW.assigned_at := now();
  ELSIF NEW.assigned_setter_id IS NULL
        AND (TG_OP = 'UPDATE' AND OLD.assigned_setter_id IS NOT NULL) THEN
    -- Cleared
    IF NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
      NEW.assigned_user_id := NULL;
    END IF;
    NEW.assigned_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_assigned_user
  BEFORE INSERT OR UPDATE OF assigned_setter_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.sync_assigned_user_from_setter();

-- 3. setter_performance RPC
CREATE OR REPLACE FUNCTION public.setter_performance(
  _workspace_id uuid,
  _from timestamptz,
  _to timestamptz,
  _pipeline_id uuid DEFAULT NULL,
  _setter_id uuid DEFAULT NULL
)
RETURNS TABLE(
  setter_id uuid,
  display_name text,
  avatar_url text,
  is_external boolean,
  linked_user_id uuid,
  active_chats bigint,
  avg_first_response_seconds numeric,
  median_first_response_seconds numeric,
  avg_reply_seconds numeric,
  median_reply_seconds numeric,
  replies_in_window bigint,
  conv_booked bigint,
  conv_showed bigint,
  conv_closed bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_manager boolean;
  _is_self boolean := false;
  _self_setter uuid;
BEGIN
  _is_manager := public.is_workspace_manager(_workspace_id, auth.uid());

  -- Resolve the caller's own setter row in this workspace (if any)
  SELECT id INTO _self_setter
    FROM public.workspace_setters
    WHERE workspace_id = _workspace_id AND linked_user_id = auth.uid()
    LIMIT 1;

  IF _setter_id IS NOT NULL THEN
    _is_self := (_setter_id = _self_setter);
    IF NOT _is_manager AND NOT _is_self THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    IF NOT _is_manager THEN
      -- Non-managers must scope to themselves
      IF _self_setter IS NULL THEN
        RAISE EXCEPTION 'Not authorized';
      END IF;
      _setter_id := _self_setter;
    END IF;
  END IF;

  RETURN QUERY
  WITH setters AS (
    SELECT s.*
    FROM public.workspace_setters s
    WHERE s.workspace_id = _workspace_id
      AND s.is_active
      AND (_setter_id IS NULL OR s.id = _setter_id)
  ),
  convs AS (
    SELECT c.id, c.assigned_setter_id, c.pipeline_id,
           c.first_human_reply_at,
           (SELECT MIN(m2.created_at) FROM public.messages m2
             WHERE m2.conversation_id = c.id AND m2.direction::text = 'inbound') AS first_inbound_at
    FROM public.conversations c
    WHERE c.workspace_id = _workspace_id
      AND c.assigned_setter_id IN (SELECT id FROM setters)
      AND (_pipeline_id IS NULL OR c.pipeline_id = _pipeline_id)
  ),
  active AS (
    SELECT cv.assigned_setter_id AS sid, COUNT(*) AS n
    FROM convs cv
    JOIN public.deals d ON d.conversation_id = cv.id
    JOIN public.pipeline_stages ps ON ps.id = d.stage_id
    WHERE ps.stage_type = 'open'
    GROUP BY cv.assigned_setter_id
  ),
  first_resp AS (
    SELECT cv.assigned_setter_id AS sid,
           EXTRACT(EPOCH FROM (cv.first_human_reply_at - cv.first_inbound_at)) AS seconds
    FROM convs cv
    WHERE cv.first_human_reply_at IS NOT NULL
      AND cv.first_inbound_at IS NOT NULL
      AND cv.first_human_reply_at >= _from AND cv.first_human_reply_at < _to
  ),
  first_agg AS (
    SELECT sid,
           AVG(seconds) AS avg_s,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds) AS med_s
    FROM first_resp
    WHERE seconds >= 0
    GROUP BY sid
  ),
  reply_pairs AS (
    SELECT cv.assigned_setter_id AS sid,
           EXTRACT(EPOCH FROM (m.created_at - (
             SELECT MAX(m2.created_at) FROM public.messages m2
              WHERE m2.conversation_id = m.conversation_id
                AND m2.direction::text = 'inbound'
                AND m2.created_at < m.created_at
           ))) AS seconds
    FROM convs cv
    JOIN public.messages m ON m.conversation_id = cv.id
    WHERE m.direction::text = 'outbound'
      AND m.sent_by_user_id IS NOT NULL
      AND m.created_at >= _from AND m.created_at < _to
  ),
  reply_agg AS (
    SELECT sid,
           AVG(seconds) AS avg_s,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds) AS med_s,
           COUNT(*) AS n
    FROM reply_pairs
    WHERE seconds IS NOT NULL AND seconds >= 0
    GROUP BY sid
  ),
  conv_stages AS (
    SELECT cv.assigned_setter_id AS sid,
           COUNT(*) FILTER (WHERE ps.name ~* '(book|meeting|demo|call\s*scheduled)') AS booked,
           COUNT(*) FILTER (WHERE ps.name ~* '(show|attended|attend)')               AS showed,
           COUNT(*) FILTER (WHERE ps.stage_type = 'won' OR ps.name ~* '(closed|won|paid|client)') AS closed
    FROM convs cv
    JOIN public.deals d ON d.conversation_id = cv.id
    JOIN public.pipeline_stages ps ON ps.id = d.stage_id
    WHERE d.updated_at >= _from AND d.updated_at < _to
    GROUP BY cv.assigned_setter_id
  )
  SELECT
    s.id, s.display_name, s.avatar_url, s.external, s.linked_user_id,
    COALESCE(a.n, 0),
    f.avg_s, f.med_s,
    r.avg_s, r.med_s,
    COALESCE(r.n, 0),
    COALESCE(cs.booked, 0), COALESCE(cs.showed, 0), COALESCE(cs.closed, 0)
  FROM setters s
  LEFT JOIN active     a  ON a.sid = s.id
  LEFT JOIN first_agg  f  ON f.sid = s.id
  LEFT JOIN reply_agg  r  ON r.sid = s.id
  LEFT JOIN conv_stages cs ON cs.sid = s.id
  ORDER BY COALESCE(a.n, 0) DESC, s.display_name;
END $$;

-- Backfill: create a setter row for each existing workspace member (so behaviour stays consistent)
INSERT INTO public.workspace_setters (workspace_id, display_name, linked_user_id, external)
SELECT wm.workspace_id,
       COALESCE(p.full_name, u.email, 'Setter'),
       wm.user_id,
       false
FROM public.workspace_members wm
LEFT JOIN public.profiles p ON p.user_id = wm.user_id
LEFT JOIN auth.users u ON u.id = wm.user_id
ON CONFLICT (workspace_id, linked_user_id) DO NOTHING;

-- Also include the workspace owner
INSERT INTO public.workspace_setters (workspace_id, display_name, linked_user_id, external)
SELECT w.id,
       COALESCE(p.full_name, u.email, 'Owner'),
       w.owner_user_id,
       false
FROM public.workspaces w
LEFT JOIN public.profiles p ON p.user_id = w.owner_user_id
LEFT JOIN auth.users u ON u.id = w.owner_user_id
WHERE w.owner_user_id IS NOT NULL
ON CONFLICT (workspace_id, linked_user_id) DO NOTHING;

-- Backfill assigned_setter_id from existing assigned_user_id
UPDATE public.conversations c
SET assigned_setter_id = s.id
FROM public.workspace_setters s
WHERE c.assigned_user_id IS NOT NULL
  AND s.workspace_id = c.workspace_id
  AND s.linked_user_id = c.assigned_user_id
  AND c.assigned_setter_id IS NULL;

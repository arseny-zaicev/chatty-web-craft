
-- 1. Columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_human_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_human_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS waiting_since timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_waiting
  ON public.conversations(assigned_user_id, waiting_since) WHERE waiting_since IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_last_human
  ON public.conversations(assigned_user_id, last_human_reply_at DESC NULLS LAST);

-- 2. Trigger to set assigned_at when assignee changes
CREATE OR REPLACE FUNCTION public.set_conversation_assigned_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_user_id IS NOT NULL AND NEW.assigned_at IS NULL THEN
      NEW.assigned_at := now();
    END IF;
  ELSIF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    NEW.assigned_at := CASE WHEN NEW.assigned_user_id IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_conversation_assigned_at ON public.conversations;
CREATE TRIGGER trg_set_conversation_assigned_at
  BEFORE INSERT OR UPDATE OF assigned_user_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_conversation_assigned_at();

-- 3. Trigger on messages: maintain reply timestamps + waiting_since
CREATE OR REPLACE FUNCTION public.touch_conversation_reply_timing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction::text = 'inbound' THEN
    UPDATE public.conversations c
       SET last_inbound_at = GREATEST(COALESCE(last_inbound_at, NEW.created_at), NEW.created_at),
           waiting_since = CASE
             WHEN last_human_reply_at IS NULL OR last_human_reply_at < NEW.created_at
               THEN COALESCE(waiting_since, NEW.created_at)
             ELSE waiting_since
           END
     WHERE c.id = NEW.conversation_id;
  ELSIF NEW.direction::text = 'outbound' AND NEW.sent_by_user_id IS NOT NULL THEN
    UPDATE public.conversations c
       SET first_human_reply_at = COALESCE(first_human_reply_at, NEW.created_at),
           last_human_reply_at = GREATEST(COALESCE(last_human_reply_at, NEW.created_at), NEW.created_at),
           waiting_since = NULL
     WHERE c.id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_conversation_reply_timing ON public.messages;
CREATE TRIGGER trg_touch_conversation_reply_timing
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_reply_timing();

-- 4. Backfill from history
WITH per_conv AS (
  SELECT
    m.conversation_id,
    MIN(m.created_at) FILTER (WHERE m.direction::text = 'outbound' AND m.sent_by_user_id IS NOT NULL) AS first_human,
    MAX(m.created_at) FILTER (WHERE m.direction::text = 'outbound' AND m.sent_by_user_id IS NOT NULL) AS last_human,
    MAX(m.created_at) FILTER (WHERE m.direction::text = 'inbound') AS last_inbound
  FROM public.messages m
  GROUP BY m.conversation_id
)
UPDATE public.conversations c
   SET first_human_reply_at = COALESCE(c.first_human_reply_at, p.first_human),
       last_human_reply_at = COALESCE(c.last_human_reply_at, p.last_human),
       last_inbound_at = COALESCE(c.last_inbound_at, p.last_inbound),
       waiting_since = CASE
         WHEN p.last_inbound IS NOT NULL
          AND (p.last_human IS NULL OR p.last_human < p.last_inbound)
         THEN p.last_inbound
         ELSE NULL
       END
  FROM per_conv p
 WHERE p.conversation_id = c.id;

UPDATE public.conversations
   SET assigned_at = COALESCE(assigned_at, updated_at, created_at)
 WHERE assigned_user_id IS NOT NULL AND assigned_at IS NULL;

-- 5. RPC: ops_operator_performance
DROP FUNCTION IF EXISTS public.ops_operator_performance(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.ops_operator_performance(
  _window_start timestamptz,
  _window_end timestamptz
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  assigned_now bigint,
  active_now bigint,
  unread_now bigint,
  waiting_now bigint,
  overdue_now bigint,
  oldest_waiting_at timestamptz,
  median_first_response_seconds numeric,
  median_response_seconds numeric,
  positive_replies_window bigint,
  meetings_now bigint,
  human_replies_window bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH operators AS (
    -- Anyone who is currently assignee, has been a recent responder, or has sent a human reply
    SELECT DISTINCT u.id AS user_id
    FROM auth.users u
    WHERE u.id IN (
      SELECT assigned_user_id FROM public.conversations WHERE assigned_user_id IS NOT NULL
      UNION
      SELECT sent_by_user_id FROM public.messages
        WHERE sent_by_user_id IS NOT NULL
          AND created_at >= now() - interval '30 days'
    )
  ),
  assigned AS (
    SELECT c.assigned_user_id AS user_id,
           COUNT(*) AS assigned_now,
           COUNT(*) FILTER (WHERE c.unread_count > 0) AS unread_now,
           COUNT(*) FILTER (WHERE c.waiting_since IS NOT NULL) AS waiting_now,
           COUNT(*) FILTER (WHERE c.waiting_since IS NOT NULL
             AND c.waiting_since < now() - interval '2 hours') AS overdue_now,
           MIN(c.waiting_since) AS oldest_waiting_at
      FROM public.conversations c
     WHERE c.assigned_user_id IS NOT NULL
     GROUP BY c.assigned_user_id
  ),
  active AS (
    SELECT m.sent_by_user_id AS user_id, COUNT(DISTINCT m.conversation_id) AS active_now
      FROM public.messages m
     WHERE m.direction::text = 'outbound'
       AND m.sent_by_user_id IS NOT NULL
       AND m.created_at >= now() - interval '7 days'
     GROUP BY m.sent_by_user_id
  ),
  -- First-reply medians: per conversation, take first inbound and first human reply within window
  first_replies AS (
    SELECT c.assigned_user_id AS user_id,
           EXTRACT(EPOCH FROM (
             c.first_human_reply_at - (
               SELECT MIN(m2.created_at) FROM public.messages m2
                WHERE m2.conversation_id = c.id AND m2.direction::text = 'inbound'
             )
           )) AS seconds
      FROM public.conversations c
     WHERE c.first_human_reply_at IS NOT NULL
       AND c.first_human_reply_at >= _window_start
       AND c.first_human_reply_at <  _window_end
       AND c.assigned_user_id IS NOT NULL
  ),
  first_med AS (
    SELECT user_id,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds) AS median_first_response_seconds
      FROM first_replies
     WHERE seconds IS NOT NULL AND seconds >= 0
     GROUP BY user_id
  ),
  -- Follow-up response: each human reply that follows an inbound, gap = reply - inbound it answered
  reply_pairs AS (
    SELECT m.sent_by_user_id AS user_id,
           EXTRACT(EPOCH FROM (m.created_at - (
             SELECT MAX(m2.created_at) FROM public.messages m2
              WHERE m2.conversation_id = m.conversation_id
                AND m2.direction::text = 'inbound'
                AND m2.created_at < m.created_at
           ))) AS seconds
      FROM public.messages m
     WHERE m.direction::text = 'outbound'
       AND m.sent_by_user_id IS NOT NULL
       AND m.created_at >= _window_start
       AND m.created_at <  _window_end
  ),
  reply_med AS (
    SELECT user_id,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds) AS median_response_seconds,
           COUNT(*) AS human_replies_window
      FROM reply_pairs
     WHERE seconds IS NOT NULL AND seconds >= 0
     GROUP BY user_id
  ),
  positive AS (
    SELECT c.assigned_user_id AS user_id, COUNT(DISTINCT d.id) AS positive_replies_window
      FROM public.deals d
      JOIN public.pipeline_stages s ON s.id = d.stage_id
      JOIN public.conversations c ON c.id = d.conversation_id
     WHERE c.assigned_user_id IS NOT NULL
       AND s.stage_type = 'open'
       AND s.name ~* '(positive|interested|booked|hot|qualified|demo|meeting)'
       AND s.name !~* '(not\s|never|block|spam|unsubscribe)'
       AND d.updated_at >= _window_start
       AND d.updated_at <  _window_end
     GROUP BY c.assigned_user_id
  ),
  meetings AS (
    SELECT c.assigned_user_id AS user_id, COUNT(DISTINCT d.id) AS meetings_now
      FROM public.deals d
      JOIN public.pipeline_stages s ON s.id = d.stage_id
      JOIN public.conversations c ON c.id = d.conversation_id
     WHERE c.assigned_user_id IS NOT NULL
       AND s.name ~* '(meeting|booked|demo|call\s*scheduled)'
     GROUP BY c.assigned_user_id
  )
  SELECT
    o.user_id,
    p.full_name,
    u.email::text,
    COALESCE(a.assigned_now, 0),
    COALESCE(ac.active_now, 0),
    COALESCE(a.unread_now, 0),
    COALESCE(a.waiting_now, 0),
    COALESCE(a.overdue_now, 0),
    a.oldest_waiting_at,
    fm.median_first_response_seconds,
    rm.median_response_seconds,
    COALESCE(pos.positive_replies_window, 0),
    COALESCE(mt.meetings_now, 0),
    COALESCE(rm.human_replies_window, 0)
  FROM operators o
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  LEFT JOIN auth.users     u ON u.id      = o.user_id
  LEFT JOIN assigned       a ON a.user_id = o.user_id
  LEFT JOIN active         ac ON ac.user_id = o.user_id
  LEFT JOIN first_med      fm ON fm.user_id = o.user_id
  LEFT JOIN reply_med      rm ON rm.user_id = o.user_id
  LEFT JOIN positive       pos ON pos.user_id = o.user_id
  LEFT JOIN meetings       mt ON mt.user_id = o.user_id
  ORDER BY COALESCE(a.overdue_now, 0) DESC,
           a.oldest_waiting_at ASC NULLS LAST;
END $$;

-- 6. Drilldown helper: assigned conversations for one operator
DROP FUNCTION IF EXISTS public.ops_operator_assigned_conversations(uuid);
CREATE OR REPLACE FUNCTION public.ops_operator_assigned_conversations(_user_id uuid)
RETURNS TABLE(
  conversation_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  pipeline_id uuid,
  pipeline_name text,
  contact_phone text,
  contact_name text,
  unread_count integer,
  last_inbound_at timestamptz,
  last_human_reply_at timestamptz,
  waiting_since timestamptz,
  assigned_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
  SELECT c.id, c.workspace_id, w.name, w.slug, c.pipeline_id, pl.name,
         c.contact_phone, c.contact_name, c.unread_count,
         c.last_inbound_at, c.last_human_reply_at, c.waiting_since, c.assigned_at
    FROM public.conversations c
    LEFT JOIN public.workspaces w ON w.id = c.workspace_id
    LEFT JOIN public.pipelines pl ON pl.id = c.pipeline_id
   WHERE c.assigned_user_id = _user_id
   ORDER BY c.waiting_since DESC NULLS LAST, c.last_inbound_at DESC NULLS LAST;
END $$;

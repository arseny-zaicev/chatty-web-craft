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

  SELECT ws.id INTO _self_setter
    FROM public.workspace_setters ws
    WHERE ws.workspace_id = _workspace_id AND ws.linked_user_id = auth.uid()
    LIMIT 1;

  IF _setter_id IS NOT NULL THEN
    _is_self := (_setter_id = _self_setter);
    IF NOT _is_manager AND NOT _is_self THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    IF NOT _is_manager THEN
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
      AND c.assigned_setter_id IN (SELECT s.id FROM setters s)
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
  ORDER BY s.display_name;
END;
$$;
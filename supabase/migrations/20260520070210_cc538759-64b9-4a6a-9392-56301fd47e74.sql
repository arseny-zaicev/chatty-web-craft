-- =========================================================================
-- PHASE B — Canonical metrics layer
-- =========================================================================

-- 1) Canonical function: source-aware, deduped metrics for any window.
--    `_source` = 'all' | 'campaign' | 'inbox' | 'template'
CREATE OR REPLACE FUNCTION public.metrics_for_range(
  _workspace_id uuid,
  _from timestamptz,
  _to timestamptz,
  _source text DEFAULT 'all'
)
RETURNS TABLE (
  workspace_id uuid,
  whatsapp_number_id uuid,
  sent int,
  delivered int,
  failed int,
  replies int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- dedup: one row per (provider_message_id, number) with the "best" status
  -- precedence: read > delivered > sent > failed
  e AS (
    SELECT
      ev.workspace_id,
      ev.whatsapp_number_id,
      ev.provider_message_id,
      MAX(CASE ev.event_type
        WHEN 'read'      THEN 4
        WHEN 'delivered' THEN 3
        WHEN 'sent'      THEN 2
        WHEN 'failed'    THEN 1
        ELSE 0 END) AS rank
    FROM public.whatsapp_message_events ev
    WHERE ev.received_at >= _from
      AND ev.received_at <  _to
      AND (_workspace_id IS NULL OR ev.workspace_id = _workspace_id)
      AND (_source = 'all' OR ev.source = _source)
      AND ev.provider_message_id IS NOT NULL
    GROUP BY ev.workspace_id, ev.whatsapp_number_id, ev.provider_message_id
  ),
  agg AS (
    SELECT
      e.workspace_id,
      e.whatsapp_number_id,
      COUNT(*) FILTER (WHERE e.rank >= 2)::int AS sent,
      COUNT(*) FILTER (WHERE e.rank >= 3)::int AS delivered,
      COUNT(*) FILTER (WHERE e.rank = 1)::int AS failed
    FROM e
    GROUP BY 1, 2
  ),
  r AS (
    SELECT c.workspace_id, c.whatsapp_number_id, COUNT(*)::int AS replies
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.direction = 'inbound'
      AND m.created_at >= _from
      AND m.created_at <  _to
      AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    GROUP BY 1, 2
  )
  SELECT
    COALESCE(agg.workspace_id, r.workspace_id)             AS workspace_id,
    COALESCE(agg.whatsapp_number_id, r.whatsapp_number_id) AS whatsapp_number_id,
    COALESCE(agg.sent, 0)      AS sent,
    COALESCE(agg.delivered, 0) AS delivered,
    COALESCE(agg.failed, 0)    AS failed,
    COALESCE(r.replies, 0)     AS replies
  FROM agg
  FULL JOIN r
    ON r.workspace_id = agg.workspace_id
   AND r.whatsapp_number_id IS NOT DISTINCT FROM agg.whatsapp_number_id;
$$;

GRANT EXECUTE ON FUNCTION public.metrics_for_range(uuid, timestamptz, timestamptz, text) TO authenticated, anon;

-- 2) Rewrite v_metrics_today to use canonical function + fix replies_today
CREATE OR REPLACE VIEW public.v_metrics_today AS
WITH t AS (SELECT dubai_start_of_day() AS d, (dubai_start_of_day() + interval '1 day') AS d_end)
SELECT
  m.workspace_id,
  SUM(m.sent)::int      AS sent_today,
  SUM(m.delivered)::int AS delivered_today,
  SUM(m.failed)::int    AS failed_today,
  SUM(m.replies)::int   AS replies_today
FROM t, LATERAL public.metrics_for_range(NULL, t.d, t.d_end, 'all') m
WHERE m.workspace_id IS NOT NULL
GROUP BY m.workspace_id;

-- 3) Rewrite v_metrics_today_by_number
CREATE OR REPLACE VIEW public.v_metrics_today_by_number AS
WITH t AS (SELECT dubai_start_of_day() AS d, (dubai_start_of_day() + interval '1 day') AS d_end)
SELECT
  m.workspace_id,
  m.whatsapp_number_id,
  m.sent      AS sent_today,
  m.delivered AS delivered_today,
  m.failed    AS failed_today
FROM t, LATERAL public.metrics_for_range(NULL, t.d, t.d_end, 'all') m
WHERE m.whatsapp_number_id IS NOT NULL;

-- 4) Rewrite v_metrics_alltime (from day 1)
CREATE OR REPLACE VIEW public.v_metrics_alltime AS
SELECT
  m.workspace_id,
  m.whatsapp_number_id,
  NULL::uuid AS campaign_id,
  m.sent      AS sent_alltime,
  m.delivered AS delivered_alltime,
  m.failed    AS failed_alltime
FROM public.metrics_for_range(NULL, '1970-01-01'::timestamptz, (now() + interval '1 day'), 'all') m
WHERE m.workspace_id IS NOT NULL OR m.whatsapp_number_id IS NOT NULL;

-- 5) Payout-canonical view: campaign-only, deduped, per day per number
CREATE OR REPLACE VIEW public.v_payout_basis AS
WITH e AS (
  SELECT
    ev.workspace_id,
    ev.whatsapp_number_id,
    ev.provider_message_id,
    (ev.received_at AT TIME ZONE 'UTC')::date AS day,
    MAX(CASE ev.event_type
      WHEN 'read'      THEN 4
      WHEN 'delivered' THEN 3
      WHEN 'sent'      THEN 2
      WHEN 'failed'    THEN 1
      ELSE 0 END) AS rank,
    MAX(ev.received_at) AS last_at
  FROM public.whatsapp_message_events ev
  WHERE ev.source = 'campaign'
    AND ev.provider_message_id IS NOT NULL
    AND ev.whatsapp_number_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
)
SELECT
  day,
  workspace_id,
  whatsapp_number_id,
  COUNT(*) FILTER (WHERE rank >= 3)::int AS delivered,
  COUNT(*) FILTER (WHERE rank = 1)::int  AS failed,
  COUNT(*) FILTER (WHERE rank >= 2)::int AS sent,
  MAX(last_at)                           AS last_at
FROM e
GROUP BY day, workspace_id, whatsapp_number_id;

-- 6) Per-number daily history (from day 1) — for "all available stats" UI
CREATE OR REPLACE VIEW public.v_metrics_daily_by_number AS
WITH e AS (
  SELECT
    ev.workspace_id,
    ev.whatsapp_number_id,
    ev.source,
    ev.provider_message_id,
    (ev.received_at AT TIME ZONE 'Asia/Dubai')::date AS day,
    MAX(CASE ev.event_type
      WHEN 'read'      THEN 4
      WHEN 'delivered' THEN 3
      WHEN 'sent'      THEN 2
      WHEN 'failed'    THEN 1
      ELSE 0 END) AS rank
  FROM public.whatsapp_message_events ev
  WHERE ev.provider_message_id IS NOT NULL
    AND ev.whatsapp_number_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5
)
SELECT
  day,
  workspace_id,
  whatsapp_number_id,
  source,
  COUNT(*) FILTER (WHERE rank >= 2)::int AS sent,
  COUNT(*) FILTER (WHERE rank >= 3)::int AS delivered,
  COUNT(*) FILTER (WHERE rank = 1)::int  AS failed
FROM e
GROUP BY day, workspace_id, whatsapp_number_id, source;
-- Drop old view (CASCADE in case anything depends on it).
DROP VIEW IF EXISTS public.v_metrics_today CASCADE;

-- Per-workspace totals: one row per workspace, no duplication.
CREATE VIEW public.v_metrics_today
WITH (security_invoker = on) AS
WITH t AS (SELECT public.dubai_start_of_day() AS d),
sent AS (
  SELECT cr.workspace_id,
         count(*) FILTER (WHERE cr.status::text <> 'failed')::int  AS sent_today,
         count(*) FILTER (WHERE cr.status::text =  'failed')::int  AS failed_today
  FROM public.campaign_recipients cr, t
  WHERE cr.sent_at IS NOT NULL AND cr.sent_at >= t.d
  GROUP BY cr.workspace_id
),
delivered AS (
  SELECT e.workspace_id,
         count(*)::int AS delivered_today
  FROM public.whatsapp_message_events e, t
  WHERE e.received_at >= t.d AND e.event_type = 'delivered'
  GROUP BY e.workspace_id
),
replies AS (
  SELECT c.workspace_id,
         count(*)::int AS replies_today
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id, t
  WHERE m.created_at >= t.d AND m.direction::text = 'inbound'
  GROUP BY c.workspace_id
)
SELECT COALESCE(s.workspace_id, d.workspace_id, r.workspace_id) AS workspace_id,
       COALESCE(s.sent_today, 0)      AS sent_today,
       COALESCE(d.delivered_today, 0) AS delivered_today,
       COALESCE(s.failed_today, 0)    AS failed_today,
       COALESCE(r.replies_today, 0)   AS replies_today
FROM sent s
FULL JOIN delivered d ON d.workspace_id = s.workspace_id
FULL JOIN replies   r ON r.workspace_id = COALESCE(s.workspace_id, d.workspace_id);

-- Per-number breakdown (sent + delivered + failed). Replies don't apply per number.
CREATE VIEW public.v_metrics_today_by_number
WITH (security_invoker = on) AS
WITH t AS (SELECT public.dubai_start_of_day() AS d),
sent AS (
  SELECT cr.workspace_id, cr.whatsapp_number_id,
         count(*) FILTER (WHERE cr.status::text <> 'failed')::int AS sent_today,
         count(*) FILTER (WHERE cr.status::text =  'failed')::int AS failed_today
  FROM public.campaign_recipients cr, t
  WHERE cr.sent_at IS NOT NULL AND cr.sent_at >= t.d
  GROUP BY cr.workspace_id, cr.whatsapp_number_id
),
delivered AS (
  SELECT e.workspace_id, e.whatsapp_number_id,
         count(*)::int AS delivered_today
  FROM public.whatsapp_message_events e, t
  WHERE e.received_at >= t.d AND e.event_type = 'delivered'
  GROUP BY e.workspace_id, e.whatsapp_number_id
)
SELECT COALESCE(s.workspace_id, d.workspace_id)             AS workspace_id,
       COALESCE(s.whatsapp_number_id, d.whatsapp_number_id) AS whatsapp_number_id,
       COALESCE(s.sent_today, 0)      AS sent_today,
       COALESCE(d.delivered_today, 0) AS delivered_today,
       COALESCE(s.failed_today, 0)    AS failed_today
FROM sent s
FULL JOIN delivered d
  ON d.workspace_id = s.workspace_id
 AND d.whatsapp_number_id = s.whatsapp_number_id;

-- Per-campaign breakdown (sent + failed). Used for active-campaign-group "sent today".
CREATE VIEW public.v_metrics_today_by_campaign
WITH (security_invoker = on) AS
WITH t AS (SELECT public.dubai_start_of_day() AS d)
SELECT cr.workspace_id, cr.campaign_id,
       count(*) FILTER (WHERE cr.status::text <> 'failed')::int AS sent_today,
       count(*) FILTER (WHERE cr.status::text =  'failed')::int AS failed_today
FROM public.campaign_recipients cr, t
WHERE cr.sent_at IS NOT NULL AND cr.sent_at >= t.d
GROUP BY cr.workspace_id, cr.campaign_id;
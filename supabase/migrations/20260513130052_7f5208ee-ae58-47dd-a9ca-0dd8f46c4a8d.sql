
-- Daily reconciliation: campaign_recipients vs whatsapp_message_events
CREATE OR REPLACE FUNCTION public.admin_reconcile_daily(
  _from timestamptz,
  _to timestamptz,
  _partner_id uuid DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
)
RETURNS TABLE(
  day date,
  whatsapp_number_id uuid,
  phone_number text,
  display_name text,
  workspace_id uuid,
  workspace_name text,
  partner_id uuid,
  partner_name text,
  recipients_sent bigint,
  recipients_failed bigint,
  events_sent bigint,
  events_delivered bigint,
  events_failed bigint,
  drift_sent bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT
      ((cr.sent_at AT TIME ZONE 'Asia/Dubai')::date) AS day,
      cr.whatsapp_number_id,
      cr.workspace_id,
      COUNT(*) FILTER (WHERE cr.status::text IN ('sent','delivered','read'))::bigint AS recipients_sent,
      COUNT(*) FILTER (WHERE cr.status::text = 'failed')::bigint AS recipients_failed
    FROM public.campaign_recipients cr
    WHERE cr.sent_at IS NOT NULL
      AND cr.sent_at >= _from AND cr.sent_at < _to
      AND cr.whatsapp_number_id IS NOT NULL
      AND (_workspace_id IS NULL OR cr.workspace_id = _workspace_id)
    GROUP BY 1,2,3
  ),
  e AS (
    SELECT
      ((ev.received_at AT TIME ZONE 'Asia/Dubai')::date) AS day,
      ev.whatsapp_number_id,
      ev.workspace_id,
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')::bigint AS events_sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered')::bigint AS events_delivered,
      COUNT(*) FILTER (WHERE ev.event_type = 'failed')::bigint AS events_failed
    FROM public.whatsapp_message_events ev
    WHERE ev.received_at >= _from AND ev.received_at < _to
      AND ev.whatsapp_number_id IS NOT NULL
      AND ev.event_type IN ('sent','delivered','failed')
      AND (_workspace_id IS NULL OR ev.workspace_id = _workspace_id)
    GROUP BY 1,2,3
  ),
  combined AS (
    SELECT
      COALESCE(r.day, e.day) AS day,
      COALESCE(r.whatsapp_number_id, e.whatsapp_number_id) AS whatsapp_number_id,
      COALESCE(r.workspace_id, e.workspace_id) AS workspace_id,
      COALESCE(r.recipients_sent, 0) AS recipients_sent,
      COALESCE(r.recipients_failed, 0) AS recipients_failed,
      COALESCE(e.events_sent, 0) AS events_sent,
      COALESCE(e.events_delivered, 0) AS events_delivered,
      COALESCE(e.events_failed, 0) AS events_failed
    FROM r
    FULL OUTER JOIN e
      ON r.day = e.day
     AND r.whatsapp_number_id = e.whatsapp_number_id
     AND r.workspace_id IS NOT DISTINCT FROM e.workspace_id
  )
  SELECT
    c.day,
    c.whatsapp_number_id,
    n.phone_number,
    n.display_name,
    c.workspace_id,
    w.name AS workspace_name,
    public.number_owner_at(c.whatsapp_number_id, (c.day::timestamptz)) AS partner_id,
    p.name AS partner_name,
    c.recipients_sent,
    c.recipients_failed,
    c.events_sent,
    c.events_delivered,
    c.events_failed,
    (c.recipients_sent - c.events_sent)::bigint AS drift_sent
  FROM combined c
  LEFT JOIN public.whatsapp_numbers n ON n.id = c.whatsapp_number_id
  LEFT JOIN public.workspaces w ON w.id = c.workspace_id
  LEFT JOIN public.partners p ON p.id = public.number_owner_at(c.whatsapp_number_id, (c.day::timestamptz))
  WHERE public.is_admin(auth.uid())
    AND (_partner_id IS NULL OR public.number_owner_at(c.whatsapp_number_id, (c.day::timestamptz)) = _partner_id)
  ORDER BY c.day DESC, n.phone_number;
$$;

-- Orphans: recipients marked sent but no matching webhook event
CREATE OR REPLACE FUNCTION public.admin_reconcile_orphans(
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
  recipient_id uuid,
  campaign_id uuid,
  workspace_id uuid,
  whatsapp_number_id uuid,
  phone_number text,
  contact_phone text,
  sent_at timestamptz,
  provider_message_id text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.id AS recipient_id,
    cr.campaign_id,
    cr.workspace_id,
    cr.whatsapp_number_id,
    n.phone_number,
    cr.contact_phone,
    cr.sent_at,
    cr.provider_message_id
  FROM public.campaign_recipients cr
  LEFT JOIN public.whatsapp_numbers n ON n.id = cr.whatsapp_number_id
  WHERE public.is_admin(auth.uid())
    AND cr.sent_at IS NOT NULL
    AND cr.sent_at >= _from AND cr.sent_at < _to
    AND cr.status::text IN ('sent','delivered','read')
    AND NOT EXISTS (
      SELECT 1 FROM public.whatsapp_message_events ev
      WHERE ev.campaign_recipient_id = cr.id
         OR (ev.provider_message_id IS NOT NULL AND ev.provider_message_id = cr.provider_message_id)
    )
  ORDER BY cr.sent_at DESC
  LIMIT 500;
$$;

-- Period summary
CREATE OR REPLACE FUNCTION public.admin_reconcile_summary(
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
  recipients_sent bigint,
  recipients_failed bigint,
  events_sent bigint,
  events_delivered bigint,
  events_failed bigint,
  orphan_count bigint,
  drift_sent bigint,
  drift_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT
      COUNT(*) FILTER (WHERE status::text IN ('sent','delivered','read'))::bigint AS recipients_sent,
      COUNT(*) FILTER (WHERE status::text = 'failed')::bigint AS recipients_failed
    FROM public.campaign_recipients
    WHERE sent_at IS NOT NULL AND sent_at >= _from AND sent_at < _to
  ),
  e AS (
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'sent')::bigint AS events_sent,
      COUNT(*) FILTER (WHERE event_type = 'delivered')::bigint AS events_delivered,
      COUNT(*) FILTER (WHERE event_type = 'failed')::bigint AS events_failed
    FROM public.whatsapp_message_events
    WHERE received_at >= _from AND received_at < _to
      AND event_type IN ('sent','delivered','failed')
  ),
  o AS (
    SELECT COUNT(*)::bigint AS orphan_count FROM public.admin_reconcile_orphans(_from, _to)
  )
  SELECT
    r.recipients_sent, r.recipients_failed,
    e.events_sent, e.events_delivered, e.events_failed,
    o.orphan_count,
    (r.recipients_sent - e.events_sent)::bigint AS drift_sent,
    CASE WHEN r.recipients_sent > 0
      THEN ROUND(100.0 * (r.recipients_sent - e.events_sent)::numeric / r.recipients_sent, 2)
      ELSE 0 END AS drift_pct
  FROM r, e, o
  WHERE public.is_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.admin_reconcile_daily(timestamptz, timestamptz, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_orphans(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_summary(timestamptz, timestamptz) TO authenticated;

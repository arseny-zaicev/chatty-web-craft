CREATE OR REPLACE FUNCTION public.partner_metrics_for_range(
  p_partner_ids uuid[],
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(
  partner_id uuid,
  sent bigint,
  delivered bigint,
  failed bigint,
  earned_usd numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT b.day, b.whatsapp_number_id, b.sent, b.delivered, b.failed
    FROM public.v_payout_basis b
    WHERE b.day >= (_from AT TIME ZONE 'UTC')::date
      AND b.day <= (_to AT TIME ZONE 'UTC')::date
  ),
  attributed AS (
    SELECT base.day, base.whatsapp_number_id, base.sent, base.delivered, base.failed,
           no.partner_id, no.rate_usd
    FROM base
    JOIN LATERAL (
      SELECT no2.partner_id, no2.rate_usd
      FROM public.number_ownership no2
      WHERE no2.whatsapp_number_id = base.whatsapp_number_id
        AND no2.effective_from::date <= base.day
        AND (no2.effective_to IS NULL OR no2.effective_to::date > base.day)
      ORDER BY no2.effective_from DESC
      LIMIT 1
    ) no ON no.partner_id = ANY(p_partner_ids)
  )
  SELECT
    partner_id,
    COALESCE(SUM(sent), 0)::bigint        AS sent,
    COALESCE(SUM(delivered), 0)::bigint   AS delivered,
    COALESCE(SUM(failed), 0)::bigint      AS failed,
    COALESCE(SUM(delivered::numeric * rate_usd), 0) AS earned_usd
  FROM attributed
  GROUP BY partner_id;
$$;

GRANT EXECUTE ON FUNCTION public.partner_metrics_for_range(uuid[], timestamptz, timestamptz) TO authenticated, service_role;
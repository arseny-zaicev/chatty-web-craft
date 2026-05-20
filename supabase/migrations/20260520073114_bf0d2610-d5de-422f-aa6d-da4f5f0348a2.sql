-- ============================================================
-- RPC: set_number_ownership
-- Atomically close current active ownership for a number and
-- insert a new one (immutable history pattern).
-- partner_id NULL → unassign only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_number_ownership(
  p_whatsapp_number_id uuid,
  p_partner_id uuid,
  p_role text DEFAULT 'provider',
  p_rate_usd numeric DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_id uuid;
BEGIN
  IF NOT is_admin(v_uid) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_whatsapp_number_id IS NULL THEN
    RAISE EXCEPTION 'whatsapp_number_id required';
  END IF;

  -- Close any currently-active ownership for this number
  UPDATE public.number_ownership
     SET effective_to = now()
   WHERE whatsapp_number_id = p_whatsapp_number_id
     AND effective_to IS NULL;

  -- If unassigning, stop here
  IF p_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.number_ownership(
    whatsapp_number_id, partner_id, role, rate_usd, notes, created_by, effective_from
  ) VALUES (
    p_whatsapp_number_id, p_partner_id,
    COALESCE(p_role, 'provider'),
    COALESCE(p_rate_usd, 0),
    p_notes, v_uid, now()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_number_ownership(uuid, uuid, text, numeric, text) TO authenticated;

-- ============================================================
-- RPC: partner_earnings_breakdown
-- Per-day per-number earnings for a partner, joining
-- v_payout_basis with the number_ownership record active at
-- the time of the day.
-- ============================================================
CREATE OR REPLACE FUNCTION public.partner_earnings_breakdown(
  p_partner_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE (
  day date,
  whatsapp_number_id uuid,
  delivered integer,
  rate_usd numeric,
  role text,
  earned_usd numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.day,
    b.whatsapp_number_id,
    b.delivered,
    no.rate_usd,
    no.role,
    (b.delivered::numeric * no.rate_usd) AS earned_usd
  FROM public.v_payout_basis b
  JOIN LATERAL (
    SELECT no2.rate_usd, no2.role, no2.partner_id
    FROM public.number_ownership no2
    WHERE no2.whatsapp_number_id = b.whatsapp_number_id
      AND no2.effective_from::date <= b.day
      AND (no2.effective_to IS NULL OR no2.effective_to::date > b.day)
    ORDER BY no2.effective_from DESC
    LIMIT 1
  ) no ON no.partner_id = p_partner_id
  WHERE b.day BETWEEN p_from AND p_to
  ORDER BY b.day DESC, b.whatsapp_number_id;
$$;

GRANT EXECUTE ON FUNCTION public.partner_earnings_breakdown(uuid, date, date) TO authenticated;
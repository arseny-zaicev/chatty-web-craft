-- Helper: rate from number_ownership at a point in time
CREATE OR REPLACE FUNCTION public.number_rate_at(
  _whatsapp_number_id uuid,
  _partner uuid,
  _role text,
  _at timestamptz
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rate_usd
    FROM public.number_ownership
   WHERE whatsapp_number_id = _whatsapp_number_id
     AND partner_id = _partner
     AND role = _role
     AND effective_from <= _at
     AND (effective_to IS NULL OR effective_to > _at)
   ORDER BY effective_from DESC
   LIMIT 1;
$$;

-- Rewrite recompute_payout_run_role to use v_payout_basis + number_ownership
CREATE OR REPLACE FUNCTION public.recompute_payout_run_role(_run_id uuid)
RETURNS payout_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
  v_from timestamptz; v_to timestamptz;
  v_referral_rate numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'cannot recompute % run', v_run.status; END IF;
  IF v_run.role IS NULL THEN
    PERFORM public.recompute_payout_run(_run_id);
    SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id;
    RETURN v_run;
  END IF;

  v_from := v_run.period_from::timestamptz;
  v_to   := (v_run.period_to + 1)::timestamptz;

  DELETE FROM public.payout_line_items WHERE payout_run_id = _run_id;

  IF v_run.role = 'referral' THEN
    SELECT referral_rate_usd INTO v_referral_rate FROM public.partners WHERE id = v_run.partner_id;
    v_referral_rate := COALESCE(v_referral_rate, 0);

    INSERT INTO public.payout_line_items
      (payout_run_id, day, whatsapp_number_id, workspace_id, delivered, failed, sent,
       partner_rate_usd, client_rate_usd, payout_usd, billed_usd, margin_usd, role)
    SELECT
      _run_id,
      pb.day,
      pb.whatsapp_number_id,
      pb.workspace_id,
      pb.delivered, pb.failed, pb.sent,
      v_referral_rate,
      public.workspace_billing_rate_at(pb.workspace_id, pb.last_at) AS c_rate,
      ROUND(pb.delivered * v_referral_rate, 4),
      ROUND(pb.delivered * public.workspace_billing_rate_at(pb.workspace_id, pb.last_at), 4),
      ROUND(pb.delivered * (public.workspace_billing_rate_at(pb.workspace_id, pb.last_at) - v_referral_rate), 4),
      v_run.role
    FROM public.v_payout_basis pb
    WHERE pb.day BETWEEN v_run.period_from AND v_run.period_to
      AND public.number_owner_at(pb.whatsapp_number_id, pb.last_at) IN (
        SELECT id FROM public.partners WHERE referrer_partner_id = v_run.partner_id
      );
  ELSE
    -- provider / other roles: use number_ownership
    INSERT INTO public.payout_line_items
      (payout_run_id, day, whatsapp_number_id, workspace_id, delivered, failed, sent,
       partner_rate_usd, client_rate_usd, payout_usd, billed_usd, margin_usd, role)
    SELECT
      _run_id,
      pb.day,
      pb.whatsapp_number_id,
      pb.workspace_id,
      pb.delivered, pb.failed, pb.sent,
      public.number_rate_at(pb.whatsapp_number_id, v_run.partner_id, v_run.role, pb.last_at) AS p_rate,
      public.workspace_billing_rate_at(pb.workspace_id, pb.last_at) AS c_rate,
      ROUND(pb.delivered * public.number_rate_at(pb.whatsapp_number_id, v_run.partner_id, v_run.role, pb.last_at), 4),
      ROUND(pb.delivered * public.workspace_billing_rate_at(pb.workspace_id, pb.last_at), 4),
      ROUND(pb.delivered * (public.workspace_billing_rate_at(pb.workspace_id, pb.last_at) - public.number_rate_at(pb.whatsapp_number_id, v_run.partner_id, v_run.role, pb.last_at)), 4),
      v_run.role
    FROM public.v_payout_basis pb
    WHERE pb.day BETWEEN v_run.period_from AND v_run.period_to
      AND public.number_rate_at(pb.whatsapp_number_id, v_run.partner_id, v_run.role, pb.last_at) IS NOT NULL;
  END IF;

  UPDATE public.payout_runs SET updated_at = now() WHERE id = _run_id;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id;
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION public.number_rate_at(uuid, uuid, text, timestamptz) TO authenticated;
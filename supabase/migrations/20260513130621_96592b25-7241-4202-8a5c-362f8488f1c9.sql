
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS referrer_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_rate_usd numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_partners_referrer ON public.partners(referrer_partner_id);

-- Update referral payout calculation:
-- For role='referral', compute over delivered events on numbers owned (via number_ownership)
-- by any partner whose referrer_partner_id = this partner. Rate comes from partners.referral_rate_usd.
CREATE OR REPLACE FUNCTION public.recompute_payout_run_role(_run_id uuid)
RETURNS public.payout_runs
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
  v_from timestamptz; v_to timestamptz;
  v_hash text; v_count int;
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

    WITH ev AS (
      SELECT e.id, e.event_type, e.received_at, e.whatsapp_number_id, e.workspace_id,
             public.number_owner_at(e.whatsapp_number_id, e.received_at) AS owner_id
        FROM public.whatsapp_message_events e
       WHERE e.received_at >= v_from
         AND e.received_at <  v_to
         AND e.event_type IN ('delivered','failed','sent')
         AND e.whatsapp_number_id IS NOT NULL
    ),
    referees AS (
      SELECT id FROM public.partners WHERE referrer_partner_id = v_run.partner_id
    ),
    scoped AS (
      SELECT ev.* FROM ev
       WHERE ev.owner_id IN (SELECT id FROM referees)
    ),
    agg AS (
      SELECT (received_at AT TIME ZONE 'UTC')::date AS day,
             whatsapp_number_id, workspace_id,
             COUNT(*) FILTER (WHERE event_type='delivered') AS delivered,
             COUNT(*) FILTER (WHERE event_type='failed')    AS failed,
             COUNT(*) FILTER (WHERE event_type='sent')      AS sent,
             MAX(received_at) AS last_at
        FROM scoped
       GROUP BY 1,2,3
    ),
    priced AS (
      SELECT a.*, public.workspace_billing_rate_at(a.workspace_id, a.last_at) AS c_rate
        FROM agg a
    )
    INSERT INTO public.payout_line_items
      (payout_run_id, day, whatsapp_number_id, workspace_id, delivered, failed, sent,
       partner_rate_usd, client_rate_usd, payout_usd, billed_usd, margin_usd, role)
    SELECT _run_id, day, whatsapp_number_id, workspace_id, delivered, failed, sent,
           v_referral_rate, c_rate,
           ROUND(delivered * v_referral_rate, 4),
           ROUND(delivered * c_rate, 4),
           ROUND(delivered * (c_rate - v_referral_rate), 4),
           v_run.role
      FROM priced;
  ELSE
    -- provider role: use bm_partner_assignments
    WITH ev AS (
      SELECT e.id, e.event_type, e.received_at, e.whatsapp_number_id, e.workspace_id,
             n.business_manager_id AS bm_id
        FROM public.whatsapp_message_events e
        JOIN public.whatsapp_numbers n ON n.id = e.whatsapp_number_id
       WHERE e.received_at >= v_from
         AND e.received_at <  v_to
         AND e.event_type IN ('delivered','failed','sent')
         AND n.business_manager_id IS NOT NULL
    ),
    scoped AS (
      SELECT ev.*, public.bm_assignment_rate_at(ev.bm_id, v_run.partner_id, v_run.role, ev.received_at) AS p_rate
        FROM ev
       WHERE public.bm_assignment_rate_at(ev.bm_id, v_run.partner_id, v_run.role, ev.received_at) IS NOT NULL
    ),
    agg AS (
      SELECT (received_at AT TIME ZONE 'UTC')::date AS day,
             whatsapp_number_id, workspace_id,
             COUNT(*) FILTER (WHERE event_type='delivered') AS delivered,
             COUNT(*) FILTER (WHERE event_type='failed')    AS failed,
             COUNT(*) FILTER (WHERE event_type='sent')      AS sent,
             MAX(p_rate) AS p_rate,
             MAX(received_at) AS last_at
        FROM scoped
       GROUP BY 1,2,3
    ),
    priced AS (
      SELECT a.*, public.workspace_billing_rate_at(a.workspace_id, a.last_at) AS c_rate
        FROM agg a
    )
    INSERT INTO public.payout_line_items
      (payout_run_id, day, whatsapp_number_id, workspace_id, delivered, failed, sent,
       partner_rate_usd, client_rate_usd, payout_usd, billed_usd, margin_usd, role)
    SELECT _run_id, day, whatsapp_number_id, workspace_id, delivered, failed, sent,
           p_rate, c_rate,
           ROUND(delivered * p_rate, 4),
           ROUND(delivered * c_rate, 4),
           ROUND(delivered * (c_rate - p_rate), 4),
           v_run.role
      FROM priced;
  END IF;

  SELECT COUNT(*), md5(string_agg(id::text, ',' ORDER BY id))
    INTO v_count, v_hash
    FROM (
      SELECT e.id FROM public.whatsapp_message_events e
       WHERE e.received_at >= v_from AND e.received_at < v_to
    ) s;

  UPDATE public.payout_runs r SET
    totals_delivered = COALESCE((SELECT SUM(delivered) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    totals_failed    = COALESCE((SELECT SUM(failed)    FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    totals_sent      = COALESCE((SELECT SUM(sent)      FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    total_payout_usd = COALESCE((SELECT SUM(payout_usd) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    total_billed_usd = COALESCE((SELECT SUM(billed_usd) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    margin_usd       = COALESCE((SELECT SUM(margin_usd) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    source_data_hash = v_hash,
    source_event_count = COALESCE(v_count,0),
    generated_at = now(),
    generated_by = auth.uid()
   WHERE r.id = _run_id
   RETURNING * INTO v_run;

  INSERT INTO public.payout_run_audit (payout_run_id, action, actor, after)
    VALUES (_run_id, 'recomputed', auth.uid(), to_jsonb(v_run));

  RETURN v_run;
END $$;

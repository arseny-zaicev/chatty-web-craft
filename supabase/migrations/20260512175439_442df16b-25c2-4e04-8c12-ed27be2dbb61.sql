-- Partners control module: additive schema
-- 1) Extend partners with kind, cadence, slack auto-post, watermark
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS cadence_anchor int,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dubai',
  ADD COLUMN IF NOT EXISTS auto_post_slack boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_run_period_to date;

DO $$ BEGIN
  ALTER TABLE public.partners ADD CONSTRAINT partners_kind_chk CHECK (kind IN ('provider','referral','both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.partners ADD CONSTRAINT partners_cadence_chk CHECK (cadence IN ('off','weekly','monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) BM ↔ partner assignments (provider/referral split)
CREATE TABLE IF NOT EXISTS public.bm_partner_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_manager_id uuid NOT NULL REFERENCES public.business_managers(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('provider','referral')),
  rate_usd numeric NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_bmpa_bm  ON public.bm_partner_assignments (business_manager_id, role, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_bmpa_partner ON public.bm_partner_assignments (partner_id, effective_from DESC);

ALTER TABLE public.bm_partner_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage bm partner assignments" ON public.bm_partner_assignments;
CREATE POLICY "Admins manage bm partner assignments" ON public.bm_partner_assignments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3) BM operational fields
ALTER TABLE public.business_managers
  ADD COLUMN IF NOT EXISTS warmup_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ads_running boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_bm_id text;

-- Auto-stamp warmup_completed_at when status leaves 'warming'
CREATE OR REPLACE FUNCTION public.stamp_bm_warmup_completed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'warming' AND NEW.status <> 'warming' AND NEW.warmup_completed_at IS NULL THEN
    NEW.warmup_completed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_bm_warmup_completed ON public.business_managers;
CREATE TRIGGER trg_stamp_bm_warmup_completed
  BEFORE UPDATE OF status ON public.business_managers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_bm_warmup_completed();

-- 4) Payout runs: role + cadence + slack + auto flag
ALTER TABLE public.payout_runs
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS cadence text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_message_ts text,
  ADD COLUMN IF NOT EXISTS slack_channel_id text;

DO $$ BEGIN
  ALTER TABLE public.payout_runs ADD CONSTRAINT payout_runs_role_chk CHECK (role IS NULL OR role IN ('provider','referral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payout_runs ADD CONSTRAINT payout_runs_cadence_chk CHECK (cadence IN ('manual','weekly','monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payout_line_items
  ADD COLUMN IF NOT EXISTS role text;

DO $$ BEGIN
  ALTER TABLE public.payout_line_items ADD CONSTRAINT pli_role_chk CHECK (role IS NULL OR role IN ('provider','referral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Helper: effective rate for a (BM, partner, role) at time t
CREATE OR REPLACE FUNCTION public.bm_assignment_rate_at(
  _bm uuid, _partner uuid, _role text, _at timestamptz
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rate_usd
    FROM public.bm_partner_assignments
   WHERE business_manager_id = _bm
     AND partner_id = _partner
     AND role = _role
     AND effective_from <= _at
     AND (effective_to IS NULL OR effective_to > _at)
   ORDER BY effective_from DESC
   LIMIT 1;
$$;

-- 6) Generate payout run with role (so cadence ticker can produce per-role runs)
CREATE OR REPLACE FUNCTION public.generate_payout_run_role(
  _partner_id uuid, _role text, _from date, _to date, _cadence text DEFAULT 'manual', _auto boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  IF _role NOT IN ('provider','referral') THEN RAISE EXCEPTION 'bad role'; END IF;
  INSERT INTO public.payout_runs (partner_id, period_from, period_to, generated_by, role, cadence, auto_generated)
    VALUES (_partner_id, _from, _to, auth.uid(), _role, _cadence, _auto)
    RETURNING id INTO v_id;
  INSERT INTO public.payout_run_audit (payout_run_id, action, actor)
    VALUES (v_id, 'created', auth.uid());
  PERFORM public.recompute_payout_run_role(v_id);
  RETURN v_id;
END $$;

-- 7) Recompute payout run scoped by role, using bm_partner_assignments
CREATE OR REPLACE FUNCTION public.recompute_payout_run_role(_run_id uuid)
RETURNS public.payout_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
  v_from timestamptz;
  v_to   timestamptz;
  v_hash text;
  v_count int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'cannot recompute % run', v_run.status; END IF;
  IF v_run.role IS NULL THEN
    -- fall back to legacy computation
    PERFORM public.recompute_payout_run(_run_id);
    SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id;
    RETURN v_run;
  END IF;

  v_from := v_run.period_from::timestamptz;
  v_to   := (v_run.period_to + 1)::timestamptz;

  DELETE FROM public.payout_line_items WHERE payout_run_id = _run_id;

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

  SELECT COUNT(*), md5(string_agg(id::text, ',' ORDER BY id))
    INTO v_count, v_hash
    FROM (
      SELECT e.id FROM public.whatsapp_message_events e
        JOIN public.whatsapp_numbers n ON n.id = e.whatsapp_number_id
       WHERE e.received_at >= v_from AND e.received_at < v_to
         AND public.bm_assignment_rate_at(n.business_manager_id, v_run.partner_id, v_run.role, e.received_at) IS NOT NULL
    ) s;

  UPDATE public.payout_runs r SET
    totals_delivered = COALESCE((SELECT SUM(delivered) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    totals_failed    = COALESCE((SELECT SUM(failed)    FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    totals_sent      = COALESCE((SELECT SUM(sent)      FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    total_payout_usd = COALESCE((SELECT SUM(payout_usd) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    total_billed_usd = COALESCE((SELECT SUM(billed_usd) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    margin_usd       = COALESCE((SELECT SUM(margin_usd) FROM public.payout_line_items WHERE payout_run_id = _run_id),0),
    source_data_hash = v_hash,
    source_event_count = COALESCE(v_count, 0),
    generated_at = now()
   WHERE r.id = _run_id
   RETURNING * INTO v_run;

  INSERT INTO public.payout_run_audit (payout_run_id, action, actor, after)
    VALUES (_run_id, 'recomputed', auth.uid(), to_jsonb(v_run));

  RETURN v_run;
END $$;
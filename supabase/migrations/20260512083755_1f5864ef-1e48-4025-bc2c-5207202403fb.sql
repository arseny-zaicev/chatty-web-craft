
-- =========================================================================
-- PARTNER PAYOUT & DELIVERY FINANCE MODULE
-- =========================================================================

-- 1. PARTNERS ----------------------------------------------------------------
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_email text,
  contact_phone text,
  payment_notes text,
  default_payout_rate_usd numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage partners" ON public.partners
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER trg_partners_updated BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. PARTNER RATES (time-versioned) -----------------------------------------
CREATE TABLE public.partner_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('default','number','workspace')),
  whatsapp_number_id uuid,
  workspace_id uuid,
  rate_usd numeric NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT partner_rate_scope_consistent CHECK (
    (scope = 'default'   AND whatsapp_number_id IS NULL AND workspace_id IS NULL) OR
    (scope = 'number'    AND whatsapp_number_id IS NOT NULL AND workspace_id IS NULL) OR
    (scope = 'workspace' AND workspace_id IS NOT NULL AND whatsapp_number_id IS NULL)
  )
);
CREATE INDEX idx_partner_rates_lookup ON public.partner_rates(partner_id, scope, effective_from DESC);
CREATE INDEX idx_partner_rates_number ON public.partner_rates(whatsapp_number_id) WHERE whatsapp_number_id IS NOT NULL;
CREATE INDEX idx_partner_rates_workspace ON public.partner_rates(workspace_id) WHERE workspace_id IS NOT NULL;
ALTER TABLE public.partner_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage partner rates" ON public.partner_rates
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 3. WORKSPACE BILLING RATES (time-versioned) -------------------------------
CREATE TABLE public.workspace_billing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  rate_usd numeric NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_wbr_lookup ON public.workspace_billing_rates(workspace_id, effective_from DESC);
ALTER TABLE public.workspace_billing_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage billing rates" ON public.workspace_billing_rates
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Seed billing rates from existing workspaces.delivered_rate_usd
INSERT INTO public.workspace_billing_rates (workspace_id, rate_usd, effective_from)
SELECT id, COALESCE(delivered_rate_usd, 0), created_at FROM public.workspaces;

-- 4. NUMBER OWNERSHIP (time-versioned) --------------------------------------
CREATE TABLE public.number_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_no_lookup ON public.number_ownership(whatsapp_number_id, effective_from DESC);
CREATE INDEX idx_no_partner ON public.number_ownership(partner_id, effective_from DESC);
ALTER TABLE public.number_ownership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage number ownership" ON public.number_ownership
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 5. PAYOUT RUNS ------------------------------------------------------------
CREATE TABLE public.payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  period_from date NOT NULL,
  period_to date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','void')),
  totals_delivered integer NOT NULL DEFAULT 0,
  totals_failed integer NOT NULL DEFAULT 0,
  totals_sent integer NOT NULL DEFAULT 0,
  total_payout_usd numeric NOT NULL DEFAULT 0,
  total_billed_usd numeric NOT NULL DEFAULT 0,
  margin_usd numeric NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  paid_reference text,
  paid_amount_usd numeric,
  pdf_storage_path text,
  csv_storage_path text,
  source_data_hash text,
  source_event_count integer NOT NULL DEFAULT 0,
  notes text,
  CONSTRAINT period_valid CHECK (period_to >= period_from)
);
CREATE INDEX idx_payout_runs_partner ON public.payout_runs(partner_id, period_from DESC);
CREATE INDEX idx_payout_runs_status ON public.payout_runs(status);
ALTER TABLE public.payout_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payout runs" ON public.payout_runs
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 6. PAYOUT LINE ITEMS ------------------------------------------------------
CREATE TABLE public.payout_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_run_id uuid NOT NULL REFERENCES public.payout_runs(id) ON DELETE CASCADE,
  day date NOT NULL,
  whatsapp_number_id uuid,
  workspace_id uuid,
  delivered integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  partner_rate_usd numeric NOT NULL DEFAULT 0,
  client_rate_usd numeric NOT NULL DEFAULT 0,
  payout_usd numeric NOT NULL DEFAULT 0,
  billed_usd numeric NOT NULL DEFAULT 0,
  margin_usd numeric NOT NULL DEFAULT 0,
  is_adjustment boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pli_run ON public.payout_line_items(payout_run_id);
CREATE INDEX idx_pli_number ON public.payout_line_items(whatsapp_number_id);
ALTER TABLE public.payout_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage line items" ON public.payout_line_items
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 7. PAYOUT RUN AUDIT -------------------------------------------------------
CREATE TABLE public.payout_run_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_run_id uuid NOT NULL REFERENCES public.payout_runs(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor uuid,
  at timestamptz NOT NULL DEFAULT now(),
  before jsonb,
  after jsonb,
  note text
);
CREATE INDEX idx_pra_run ON public.payout_run_audit(payout_run_id, at DESC);
ALTER TABLE public.payout_run_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.payout_run_audit
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins insert audit" ON public.payout_run_audit
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));

-- =========================================================================
-- FREEZE TRIGGER: lock line items + monetary fields once approved/paid
-- =========================================================================
CREATE OR REPLACE FUNCTION public.guard_payout_line_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM public.payout_runs
    WHERE id = COALESCE(NEW.payout_run_id, OLD.payout_run_id);
  IF st IN ('approved','paid') THEN
    RAISE EXCEPTION 'Cannot modify line items of % run', st USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_guard_pli BEFORE INSERT OR UPDATE OR DELETE ON public.payout_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_line_items();

CREATE OR REPLACE FUNCTION public.guard_payout_run_freeze()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('approved','paid') AND NEW.status = OLD.status THEN
    -- Block changes to monetary/period fields when frozen
    IF NEW.totals_delivered <> OLD.totals_delivered
       OR NEW.total_payout_usd <> OLD.total_payout_usd
       OR NEW.total_billed_usd <> OLD.total_billed_usd
       OR NEW.period_from <> OLD.period_from
       OR NEW.period_to <> OLD.period_to THEN
      RAISE EXCEPTION 'Frozen run %: monetary fields are immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_run_freeze BEFORE UPDATE ON public.payout_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_run_freeze();

-- =========================================================================
-- RATE LOOKUP HELPERS
-- =========================================================================
-- Partner rate at a moment, with priority: number > workspace > default
CREATE OR REPLACE FUNCTION public.partner_rate_at(
  _partner_id uuid, _whatsapp_number_id uuid, _workspace_id uuid, _at timestamptz
) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cand AS (
    SELECT rate_usd, CASE scope WHEN 'number' THEN 1 WHEN 'workspace' THEN 2 ELSE 3 END AS prio,
           effective_from
    FROM public.partner_rates
    WHERE partner_id = _partner_id
      AND effective_from <= _at
      AND (effective_to IS NULL OR effective_to > _at)
      AND (
        (scope = 'number'    AND whatsapp_number_id = _whatsapp_number_id) OR
        (scope = 'workspace' AND workspace_id = _workspace_id) OR
        (scope = 'default')
      )
  )
  SELECT COALESCE(
    (SELECT rate_usd FROM cand ORDER BY prio, effective_from DESC LIMIT 1),
    (SELECT default_payout_rate_usd FROM public.partners WHERE id = _partner_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_billing_rate_at(_workspace_id uuid, _at timestamptz)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT rate_usd FROM public.workspace_billing_rates
       WHERE workspace_id = _workspace_id
         AND effective_from <= _at
         AND (effective_to IS NULL OR effective_to > _at)
       ORDER BY effective_from DESC LIMIT 1),
    (SELECT delivered_rate_usd FROM public.workspaces WHERE id = _workspace_id),
    0
  );
$$;

-- Partner that owns a number at a moment
CREATE OR REPLACE FUNCTION public.number_owner_at(_whatsapp_number_id uuid, _at timestamptz)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.number_ownership
   WHERE whatsapp_number_id = _whatsapp_number_id
     AND effective_from <= _at
     AND (effective_to IS NULL OR effective_to > _at)
   ORDER BY effective_from DESC LIMIT 1;
$$;

-- =========================================================================
-- COMPUTE / REGENERATE PAYOUT RUN
-- =========================================================================
CREATE OR REPLACE FUNCTION public.recompute_payout_run(_run_id uuid)
RETURNS public.payout_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
  v_from timestamptz;
  v_to   timestamptz;
  v_hash text;
  v_count int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  IF v_run.status <> 'draft' THEN
    RAISE EXCEPTION 'cannot recompute run in status %', v_run.status;
  END IF;

  v_from := v_run.period_from::timestamptz;
  v_to   := (v_run.period_to + 1)::timestamptz;

  -- Wipe old line items
  DELETE FROM public.payout_line_items WHERE payout_run_id = _run_id;

  -- Build line items: per (day, number, workspace) with rate snapshot
  WITH ev AS (
    SELECT
      e.id, e.event_type, e.received_at, e.whatsapp_number_id, e.workspace_id,
      number_owner_at(e.whatsapp_number_id, e.received_at) AS owner_id
    FROM public.whatsapp_message_events e
    WHERE e.received_at >= v_from
      AND e.received_at <  v_to
      AND e.event_type IN ('delivered','failed','sent')
      AND e.whatsapp_number_id IS NOT NULL
  ),
  ev_owned AS (
    SELECT * FROM ev WHERE owner_id = v_run.partner_id
  ),
  agg AS (
    SELECT
      (received_at AT TIME ZONE 'UTC')::date AS day,
      whatsapp_number_id, workspace_id,
      COUNT(*) FILTER (WHERE event_type='delivered') AS delivered,
      COUNT(*) FILTER (WHERE event_type='failed')    AS failed,
      COUNT(*) FILTER (WHERE event_type='sent')      AS sent,
      MAX(received_at) AS last_at
    FROM ev_owned
    GROUP BY 1,2,3
  ),
  priced AS (
    SELECT
      a.*,
      partner_rate_at(v_run.partner_id, a.whatsapp_number_id, a.workspace_id, a.last_at) AS p_rate,
      workspace_billing_rate_at(a.workspace_id, a.last_at) AS c_rate
    FROM agg a
  )
  INSERT INTO public.payout_line_items (
    payout_run_id, day, whatsapp_number_id, workspace_id,
    delivered, failed, sent, partner_rate_usd, client_rate_usd,
    payout_usd, billed_usd, margin_usd
  )
  SELECT _run_id, day, whatsapp_number_id, workspace_id,
         delivered, failed, sent, p_rate, c_rate,
         ROUND(delivered * p_rate, 4),
         ROUND(delivered * c_rate, 4),
         ROUND(delivered * (c_rate - p_rate), 4)
  FROM priced;

  -- Hash + counts from raw window (all events on this partner's numbers)
  SELECT COUNT(*),
         md5(string_agg(id::text, ',' ORDER BY id))
    INTO v_count, v_hash
    FROM (
      SELECT e.id FROM public.whatsapp_message_events e
       WHERE e.received_at >= v_from AND e.received_at < v_to
         AND number_owner_at(e.whatsapp_number_id, e.received_at) = v_run.partner_id
    ) s;

  -- Update totals on the run
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

-- Generate a fresh draft run for a partner over a period
CREATE OR REPLACE FUNCTION public.generate_payout_run(
  _partner_id uuid, _from date, _to date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  INSERT INTO public.payout_runs (partner_id, period_from, period_to, generated_by)
    VALUES (_partner_id, _from, _to, auth.uid())
    RETURNING id INTO v_id;
  INSERT INTO public.payout_run_audit (payout_run_id, action, actor)
    VALUES (v_id, 'created', auth.uid());
  PERFORM public.recompute_payout_run(v_id);
  RETURN v_id;
END $$;

-- Verify a run by computing fresh totals from raw events without modifying it
CREATE OR REPLACE FUNCTION public.verify_payout_run(_run_id uuid)
RETURNS TABLE(
  stored_delivered int, live_delivered int,
  stored_payout numeric, live_payout numeric,
  stored_hash text, live_hash text, drift boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
  v_from timestamptz; v_to timestamptz;
  l_delivered int; l_payout numeric; l_hash text;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found'; END IF;
  v_from := v_run.period_from::timestamptz;
  v_to   := (v_run.period_to + 1)::timestamptz;

  WITH ev AS (
    SELECT e.id, e.event_type, e.received_at, e.whatsapp_number_id, e.workspace_id
      FROM public.whatsapp_message_events e
     WHERE e.received_at >= v_from AND e.received_at < v_to
       AND e.event_type IN ('delivered','failed','sent')
       AND number_owner_at(e.whatsapp_number_id, e.received_at) = v_run.partner_id
  )
  SELECT
    COALESCE(SUM(CASE WHEN event_type='delivered' THEN 1 ELSE 0 END),0)::int,
    COALESCE(SUM(CASE WHEN event_type='delivered'
      THEN partner_rate_at(v_run.partner_id, whatsapp_number_id, workspace_id, received_at) ELSE 0 END),0),
    md5(string_agg(id::text, ',' ORDER BY id))
   INTO l_delivered, l_payout, l_hash
   FROM ev;

  RETURN QUERY SELECT
    v_run.totals_delivered, l_delivered,
    v_run.total_payout_usd, ROUND(l_payout, 4),
    v_run.source_data_hash, l_hash,
    (v_run.totals_delivered <> l_delivered
     OR ROUND(v_run.total_payout_usd,4) <> ROUND(l_payout,4)
     OR COALESCE(v_run.source_data_hash,'') <> COALESCE(l_hash,''));
END $$;

-- Approve / Mark as paid / Void helpers
CREATE OR REPLACE FUNCTION public.approve_payout_run(_run_id uuid)
RETURNS public.payout_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run public.payout_runs%ROWTYPE; v_old jsonb;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'only draft can be approved'; END IF;
  v_old := to_jsonb(v_run);
  UPDATE public.payout_runs SET status='approved', approved_at=now(), approved_by=auth.uid()
    WHERE id=_run_id RETURNING * INTO v_run;
  INSERT INTO public.payout_run_audit(payout_run_id, action, actor, before, after)
    VALUES (_run_id, 'approved', auth.uid(), v_old, to_jsonb(v_run));
  RETURN v_run;
END $$;

CREATE OR REPLACE FUNCTION public.mark_payout_run_paid(
  _run_id uuid, _amount_usd numeric, _reference text
) RETURNS public.payout_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run public.payout_runs%ROWTYPE; v_old jsonb;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  IF v_run.status NOT IN ('approved','draft') THEN
    RAISE EXCEPTION 'cannot mark paid from status %', v_run.status;
  END IF;
  v_old := to_jsonb(v_run);
  UPDATE public.payout_runs SET
    status='paid', paid_at=now(), paid_by=auth.uid(),
    paid_amount_usd=_amount_usd, paid_reference=_reference,
    approved_at = COALESCE(approved_at, now()),
    approved_by = COALESCE(approved_by, auth.uid())
    WHERE id=_run_id RETURNING * INTO v_run;
  INSERT INTO public.payout_run_audit(payout_run_id, action, actor, before, after, note)
    VALUES (_run_id, 'paid', auth.uid(), v_old, to_jsonb(v_run), _reference);
  RETURN v_run;
END $$;

CREATE OR REPLACE FUNCTION public.void_payout_run(_run_id uuid, _reason text)
RETURNS public.payout_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run public.payout_runs%ROWTYPE; v_old jsonb;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  v_old := to_jsonb(v_run);
  UPDATE public.payout_runs SET status='void', notes = COALESCE(notes||' | ','')||'VOID: '||_reason
    WHERE id=_run_id RETURNING * INTO v_run;
  INSERT INTO public.payout_run_audit(payout_run_id, action, actor, before, after, note)
    VALUES (_run_id, 'voided', auth.uid(), v_old, to_jsonb(v_run), _reason);
  RETURN v_run;
END $$;

-- =========================================================================
-- STORAGE BUCKET FOR PDF/CSV ARTIFACTS
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('payout-reports', 'payout-reports', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read payout reports" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'payout-reports' AND is_admin(auth.uid()));
CREATE POLICY "Admins write payout reports" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payout-reports' AND is_admin(auth.uid()));
CREATE POLICY "Admins update payout reports" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'payout-reports' AND is_admin(auth.uid()));

-- Drift surface: counts referred numbers with payout-ownership problems.
CREATE OR REPLACE FUNCTION public.payout_ownership_drift()
RETURNS TABLE(
  unassigned_referred int,
  legacy_provider_mismatch int,
  legacy_referrer_mismatch int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH referred AS (
    SELECT n.id,
           btrim(n.provided_by) AS pb,
           btrim(n.assigned_ref) AS ar
    FROM public.whatsapp_numbers n
    WHERE (n.provided_by IS NOT NULL AND lower(btrim(n.provided_by)) <> 'self')
       OR (n.assigned_ref IS NOT NULL AND n.assigned_ref <> '')
  ),
  partner_names AS (
    SELECT lower(btrim(name)) AS lname FROM public.partners
  )
  SELECT
    (SELECT count(*)::int FROM referred r
       LEFT JOIN public.number_ownership o
         ON o.whatsapp_number_id = r.id AND o.effective_to IS NULL
       WHERE o.id IS NULL),
    (SELECT count(*)::int FROM referred r
       WHERE r.pb IS NOT NULL AND r.pb <> ''
         AND lower(r.pb) NOT IN (SELECT lname FROM partner_names)),
    (SELECT count(*)::int FROM referred r
       WHERE r.ar IS NOT NULL AND r.ar <> ''
         AND lower(r.ar) NOT IN (SELECT lname FROM partner_names));
$$;

GRANT EXECUTE ON FUNCTION public.payout_ownership_drift() TO authenticated;

-- Harden approve_payout_run: refuse while drift exists.
CREATE OR REPLACE FUNCTION public.approve_payout_run(_run_id uuid)
RETURNS public.payout_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
  v_old jsonb;
  v_unassigned int;
  v_prov_mm int;
  v_ref_mm int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin only'; END IF;

  SELECT unassigned_referred, legacy_provider_mismatch, legacy_referrer_mismatch
    INTO v_unassigned, v_prov_mm, v_ref_mm
    FROM public.payout_ownership_drift();

  IF COALESCE(v_unassigned,0) + COALESCE(v_prov_mm,0) + COALESCE(v_ref_mm,0) > 0 THEN
    RAISE EXCEPTION
      'payout ownership drift: % referred without owner, % provider text mismatch, % referrer text mismatch - fix in Fleet Registry before approving',
      v_unassigned, v_prov_mm, v_ref_mm;
  END IF;

  SELECT * INTO v_run FROM public.payout_runs WHERE id = _run_id FOR UPDATE;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'only draft can be approved'; END IF;
  v_old := to_jsonb(v_run);
  UPDATE public.payout_runs SET status='approved', approved_at=now(), approved_by=auth.uid()
    WHERE id=_run_id RETURNING * INTO v_run;
  INSERT INTO public.payout_run_audit(payout_run_id, action, actor, before, after)
    VALUES (_run_id, 'approved', auth.uid(), v_old, to_jsonb(v_run));
  RETURN v_run;
END $$;
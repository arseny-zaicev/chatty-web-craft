-- 1. Trigger on number_ownership: auto-link structured referrer and block dangling partners.
CREATE OR REPLACE FUNCTION public.number_ownership_attribution_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Only enforce on currently-active rows
  IF NEW.effective_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Auto-fill structured referrer when role='referral' and not provided
  IF NEW.role = 'referral' AND NEW.referrer_partner_id IS NULL AND NEW.partner_id IS NOT NULL THEN
    NEW.referrer_partner_id := NEW.partner_id;
  END IF;

  -- Partner must exist
  IF NEW.partner_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.partners WHERE id = NEW.partner_id) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'number_ownership.partner_id % does not match any partner', NEW.partner_id;
    END IF;
  END IF;

  -- Referrer (when structured) must also exist
  IF NEW.referrer_partner_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.partners WHERE id = NEW.referrer_partner_id) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'number_ownership.referrer_partner_id % does not match any partner', NEW.referrer_partner_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_number_ownership_attribution_guard ON public.number_ownership;
CREATE TRIGGER trg_number_ownership_attribution_guard
BEFORE INSERT OR UPDATE ON public.number_ownership
FOR EACH ROW EXECUTE FUNCTION public.number_ownership_attribution_guard();

-- 2. Trigger on whatsapp_numbers: reject new rows whose free-text provider/referrer
--    doesn't map to a real partner. Only enforced on INSERT so legacy rows are left alone.
CREATE OR REPLACE FUNCTION public.whatsapp_numbers_onboarding_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pb text;
  v_ar text;
BEGIN
  v_pb := btrim(coalesce(NEW.provided_by, ''));
  v_ar := btrim(coalesce(NEW.assigned_ref, ''));

  IF v_pb <> '' AND lower(v_pb) <> 'self' THEN
    IF NOT EXISTS (SELECT 1 FROM public.partners WHERE lower(btrim(name)) = lower(v_pb)) THEN
      RAISE EXCEPTION 'whatsapp_numbers.provided_by % does not match any partner — onboard through FleetRegistry or create the partner first', NEW.provided_by;
    END IF;
  END IF;

  IF v_ar <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.partners WHERE lower(btrim(name)) = lower(v_ar)) THEN
      RAISE EXCEPTION 'whatsapp_numbers.assigned_ref % does not match any partner — onboard through FleetRegistry or create the partner first', NEW.assigned_ref;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_numbers_onboarding_guard ON public.whatsapp_numbers;
CREATE TRIGGER trg_whatsapp_numbers_onboarding_guard
BEFORE INSERT ON public.whatsapp_numbers
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_numbers_onboarding_guard();

-- 3. Drift detail: surface referral rows missing structured referrer linkage
CREATE OR REPLACE FUNCTION public.payout_ownership_drift_details()
RETURNS TABLE(reason text, whatsapp_number_id uuid, phone_number text, display_name text, provided_by text, assigned_ref text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH referred AS (
    SELECT n.id, n.phone_number, n.display_name,
           btrim(n.provided_by) AS pb,
           btrim(n.assigned_ref) AS ar
    FROM public.whatsapp_numbers n
    WHERE (n.provided_by IS NOT NULL AND lower(btrim(n.provided_by)) <> 'self')
       OR (n.assigned_ref IS NOT NULL AND n.assigned_ref <> '')
  ),
  active_own AS (
    SELECT whatsapp_number_id, referrer_partner_id, role, partner_id
    FROM public.number_ownership
    WHERE effective_to IS NULL
  ),
  partner_names AS (SELECT lower(btrim(name)) AS lname FROM public.partners)
  SELECT 'unassigned_referred'::text, r.id, r.phone_number, r.display_name, r.pb, r.ar
    FROM referred r
    LEFT JOIN active_own o ON o.whatsapp_number_id = r.id
    WHERE o.whatsapp_number_id IS NULL
  UNION ALL
  SELECT 'legacy_provider_mismatch', r.id, r.phone_number, r.display_name, r.pb, r.ar
    FROM referred r
    WHERE r.pb IS NOT NULL AND r.pb <> ''
      AND lower(r.pb) NOT IN (SELECT lname FROM partner_names)
  UNION ALL
  SELECT 'legacy_referrer_mismatch', r.id, r.phone_number, r.display_name, r.pb, r.ar
    FROM referred r
    JOIN active_own o ON o.whatsapp_number_id = r.id
    WHERE r.ar IS NOT NULL AND r.ar <> ''
      AND o.referrer_partner_id IS NULL
      AND lower(r.ar) NOT IN (SELECT lname FROM partner_names)
  UNION ALL
  SELECT 'referral_missing_structured', n.phone_number::uuid, n.phone_number, n.display_name, null, null
    FROM public.whatsapp_numbers n
    JOIN active_own o ON o.whatsapp_number_id = n.id
    WHERE o.role = 'referral' AND o.referrer_partner_id IS NULL;
$$;
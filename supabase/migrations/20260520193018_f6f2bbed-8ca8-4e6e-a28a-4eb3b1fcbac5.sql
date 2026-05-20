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
  SELECT 'referral_missing_structured', n.id, n.phone_number, n.display_name, btrim(coalesce(n.provided_by,'')), btrim(coalesce(n.assigned_ref,''))
    FROM public.whatsapp_numbers n
    JOIN active_own o ON o.whatsapp_number_id = n.id
    WHERE o.role = 'referral' AND o.referrer_partner_id IS NULL;
$$;
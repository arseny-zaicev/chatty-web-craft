
REVOKE EXECUTE ON FUNCTION public.partner_rate_at(uuid,uuid,uuid,timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.workspace_billing_rate_at(uuid,timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.number_owner_at(uuid,timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_payout_run(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_payout_run(uuid,date,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_payout_run(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_payout_run(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_payout_run_paid(uuid,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_payout_run(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_rate_at(uuid,uuid,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_billing_rate_at(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.number_owner_at(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_payout_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_payout_run(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payout_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payout_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payout_run_paid(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_payout_run(uuid,text) TO authenticated;

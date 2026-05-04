REVOKE EXECUTE ON FUNCTION public.ensure_pipeline_stage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_deal_for_conversation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_deal_for_new_conversation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_pipeline_stage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_deal_for_conversation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_deal_for_new_conversation() TO service_role;
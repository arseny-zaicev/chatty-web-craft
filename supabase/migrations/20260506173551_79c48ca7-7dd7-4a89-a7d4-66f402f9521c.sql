-- Revoke execute on internal helper functions that should never be called directly from the API
REVOKE EXECUTE ON FUNCTION public.ensure_deal_for_conversation(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ensure_pipeline_stage(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_deal_for_new_conversation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;

-- These are used inside RLS policies and must remain callable, but restrict anon access where not needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM anon, public;
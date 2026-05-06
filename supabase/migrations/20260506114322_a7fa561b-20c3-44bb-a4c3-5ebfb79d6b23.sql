-- 1. Conversation-screenshots bucket: remove overly-permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view conversation screenshots" ON storage.objects;

-- Admins-only read for the (now private) bucket
CREATE POLICY "Admins can view conversation screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'conversation-screenshots' AND public.is_admin(auth.uid()));

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'conversation-screenshots';

-- 2. Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_deal_for_new_conversation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ensure_deal_for_conversation(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.ensure_pipeline_stage(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM anon, authenticated, public;
-- 1. Manager-level access function (admin OR workspace owner OR member with role 'manager')
CREATE OR REPLACE FUNCTION public.is_workspace_manager(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = _workspace_id AND w.owner_user_id = _user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = _workspace_id
          AND m.user_id = _user_id
          AND m.role = 'manager'
      )
$$;

-- 2. Replace permissive workspace SELECT policies on technical tables with manager-only
-- whatsapp_numbers: clients must NOT see provider keys, app names, etc.
DROP POLICY IF EXISTS "Workspace members view numbers" ON public.whatsapp_numbers;
CREATE POLICY "Workspace managers view numbers"
  ON public.whatsapp_numbers
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

-- message_templates: clients must NOT see template name/body/external IDs
DROP POLICY IF EXISTS "Workspace members view templates" ON public.message_templates;
CREATE POLICY "Workspace managers view templates"
  ON public.message_templates
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

-- workspace_library_fields: internal config, managers only
DROP POLICY IF EXISTS "Workspace members view library fields" ON public.workspace_library_fields;
DROP POLICY IF EXISTS "Workspace members insert library fields" ON public.workspace_library_fields;
DROP POLICY IF EXISTS "Workspace members update library fields" ON public.workspace_library_fields;
DROP POLICY IF EXISTS "Workspace members delete library fields" ON public.workspace_library_fields;

CREATE POLICY "Workspace managers view library fields"
  ON public.workspace_library_fields FOR SELECT TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Workspace managers insert library fields"
  ON public.workspace_library_fields FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Workspace managers update library fields"
  ON public.workspace_library_fields FOR UPDATE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Workspace managers delete library fields"
  ON public.workspace_library_fields FOR DELETE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()) AND is_builtin = false);

-- workspace_saved_replies: internal templates, managers only
DROP POLICY IF EXISTS "Workspace members view saved replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Workspace members insert saved replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Workspace members update saved replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Workspace members delete saved replies" ON public.workspace_saved_replies;

CREATE POLICY "Workspace managers view saved replies"
  ON public.workspace_saved_replies FOR SELECT TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Workspace managers insert saved replies"
  ON public.workspace_saved_replies FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "Workspace managers update saved replies"
  ON public.workspace_saved_replies FOR UPDATE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Workspace managers delete saved replies"
  ON public.workspace_saved_replies FOR DELETE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

-- 3. Allow members (including clients) to see who else is in their workspace
DROP POLICY IF EXISTS "Members view their memberships" ON public.workspace_members;
CREATE POLICY "Members view workspace memberships"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_workspace_owner(workspace_id, auth.uid())
    OR public.is_workspace_manager(workspace_id, auth.uid())
  );

-- 4. Index to speed up role lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_workspace
  ON public.workspace_members (user_id, workspace_id);
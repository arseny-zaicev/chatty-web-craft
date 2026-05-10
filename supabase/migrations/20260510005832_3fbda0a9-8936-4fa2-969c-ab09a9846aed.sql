DROP POLICY IF EXISTS "Workspace managers view library fields" ON public.workspace_library_fields;
CREATE POLICY "Workspace members view library fields"
ON public.workspace_library_fields
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));
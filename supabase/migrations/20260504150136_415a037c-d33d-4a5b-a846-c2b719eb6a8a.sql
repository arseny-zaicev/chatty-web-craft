DROP POLICY IF EXISTS "Members view workspaces" ON public.workspaces;

CREATE POLICY "Members view workspaces"
ON public.workspaces
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = workspaces.id AND m.user_id = auth.uid()
  )
);
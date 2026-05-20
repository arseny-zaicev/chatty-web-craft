DROP POLICY IF EXISTS "Admins insert quick template groups" ON public.workspace_quick_template_groups;
DROP POLICY IF EXISTS "Admins update quick template groups" ON public.workspace_quick_template_groups;
DROP POLICY IF EXISTS "Admins delete quick template groups" ON public.workspace_quick_template_groups;

CREATE POLICY "Managers insert quick template groups"
ON public.workspace_quick_template_groups FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  OR public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage')
);

CREATE POLICY "Managers update quick template groups"
ON public.workspace_quick_template_groups FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
  OR public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage')
)
WITH CHECK (
  is_admin(auth.uid())
  OR public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage')
);

CREATE POLICY "Managers delete quick template groups"
ON public.workspace_quick_template_groups FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid())
  OR public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage')
);
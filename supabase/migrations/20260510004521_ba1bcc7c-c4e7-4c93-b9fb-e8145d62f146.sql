-- Allow workspace members to view profiles of co-members in any of their workspaces
CREATE POLICY "Workspace co-members view profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.owner_user_id = profiles.user_id
      AND public.is_workspace_member(w.id, auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.workspace_members m
    JOIN public.workspace_members me ON me.workspace_id = m.workspace_id
    WHERE m.user_id = profiles.user_id
      AND me.user_id = auth.uid()
  )
);

-- Helper that returns workspace members enriched with email fallback (security definer reads auth.users)
CREATE OR REPLACE FUNCTION public.get_workspace_member_display(_workspace_id uuid)
RETURNS TABLE(user_id uuid, role text, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH membership AS (
    SELECT w.owner_user_id AS user_id, 'owner'::text AS role
    FROM public.workspaces w
    WHERE w.id = _workspace_id
    UNION
    SELECT m.user_id, m.role::text
    FROM public.workspace_members m
    WHERE m.workspace_id = _workspace_id
  )
  SELECT
    mb.user_id,
    mb.role,
    p.full_name,
    u.email::text
  FROM membership mb
  LEFT JOIN public.profiles p ON p.user_id = mb.user_id
  LEFT JOIN auth.users u ON u.id = mb.user_id
  WHERE public.is_workspace_member(_workspace_id, auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.get_workspace_member_display(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_display(uuid) TO authenticated;
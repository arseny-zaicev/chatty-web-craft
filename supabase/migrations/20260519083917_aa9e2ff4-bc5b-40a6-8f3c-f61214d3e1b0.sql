
-- 1. Add explicit per-user permission columns to workspace_members
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS perm_overview boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_inbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_pipeline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_campaigns_view boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_quick_replies_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_quick_replies_manage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_settings boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_data boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_materials boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_launch boolean NOT NULL DEFAULT false;

-- 2. Backfill: map current role + can_view_stats into explicit permissions
UPDATE public.workspace_members
SET perm_overview = true,
    perm_inbox = true,
    perm_pipeline = true,
    perm_campaigns_view = true,
    perm_quick_replies_use = true,
    perm_quick_replies_manage = true,
    perm_settings = true,
    perm_data = true,
    perm_materials = true,
    perm_launch = true
WHERE role = 'manager';

UPDATE public.workspace_members
SET perm_inbox = true,
    perm_pipeline = true,
    perm_quick_replies_use = true,
    perm_overview = can_view_stats,
    perm_campaigns_view = can_view_stats
WHERE role = 'client';

-- 3. Generic permission helper. Admin + workspace owner always bypass.
CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  _workspace_id uuid, _user_id uuid, _perm text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_sql text;
BEGIN
  IF _user_id IS NULL OR _workspace_id IS NULL THEN RETURN false; END IF;
  IF public.is_admin(_user_id) THEN RETURN true; END IF;
  IF public.is_workspace_owner(_workspace_id, _user_id) THEN RETURN true; END IF;
  IF _perm NOT IN (
    'perm_overview','perm_inbox','perm_pipeline','perm_campaigns_view',
    'perm_quick_replies_use','perm_quick_replies_manage',
    'perm_settings','perm_data','perm_materials','perm_launch'
  ) THEN
    RAISE EXCEPTION 'Unknown permission: %', _perm;
  END IF;
  v_sql := format(
    'SELECT COALESCE((SELECT %I FROM public.workspace_members
                       WHERE workspace_id = $1 AND user_id = $2 LIMIT 1), false)',
    _perm
  );
  EXECUTE v_sql INTO v_ok USING _workspace_id, _user_id;
  RETURN v_ok;
END $$;

-- 4. Redefine is_workspace_manager: a "manager" is now anyone with perm_settings
--    (plus admins and workspace owners). This automatically keeps every existing
--    manager-gated RLS policy working with the new permission model, without
--    rewriting dozens of migrations.
CREATE OR REPLACE FUNCTION public.is_workspace_manager(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR public.is_workspace_owner(_workspace_id, _user_id)
      OR EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = _workspace_id
          AND m.user_id = _user_id
          AND m.perm_settings = true
      );
$$;

-- 5. Quick Replies: split write access from "perm_settings" so a user can manage
--    shared snippets without getting full setup powers.
DROP POLICY IF EXISTS "Members insert personal, managers insert workspace" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Members update own or workspace replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Members delete own or workspace replies" ON public.workspace_saved_replies;

CREATE POLICY "Members insert personal, qr-managers insert workspace"
ON public.workspace_saved_replies
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_workspace_member(workspace_id, auth.uid())
  AND (
    (scope = 'personal')
    OR (scope = 'workspace' AND public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage'))
  )
);

CREATE POLICY "Members update own or workspace replies"
ON public.workspace_saved_replies
FOR UPDATE TO authenticated
USING (
  (scope = 'personal' AND user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (scope = 'workspace' AND public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage'))
)
WITH CHECK (
  (scope = 'personal' AND user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (scope = 'workspace' AND public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage'))
);

CREATE POLICY "Members delete own or workspace replies"
ON public.workspace_saved_replies
FOR DELETE TO authenticated
USING (
  (scope = 'personal' AND user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (scope = 'workspace' AND public.has_workspace_permission(workspace_id, auth.uid(), 'perm_quick_replies_manage'))
);

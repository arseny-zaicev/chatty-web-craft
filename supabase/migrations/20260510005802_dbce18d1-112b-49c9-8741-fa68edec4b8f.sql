ALTER TABLE public.workspace_saved_replies
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace'
  CHECK (scope IN ('workspace', 'personal'));

CREATE INDEX IF NOT EXISTS idx_wsr_scope ON public.workspace_saved_replies (workspace_id, scope);

DROP POLICY IF EXISTS "Workspace managers view saved replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Workspace managers insert saved replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Workspace managers update saved replies" ON public.workspace_saved_replies;
DROP POLICY IF EXISTS "Workspace managers delete saved replies" ON public.workspace_saved_replies;

-- SELECT: workspace replies visible to any member; personal visible only to owner
CREATE POLICY "Members view workspace and own personal replies"
ON public.workspace_saved_replies
FOR SELECT
TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (scope = 'workspace' OR user_id = auth.uid())
);

-- INSERT: managers may add workspace; any member may add personal (own)
CREATE POLICY "Members insert personal, managers insert workspace"
ON public.workspace_saved_replies
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_workspace_member(workspace_id, auth.uid())
  AND (
    (scope = 'personal')
    OR (scope = 'workspace' AND public.is_workspace_manager(workspace_id, auth.uid()))
  )
);

-- UPDATE: managers update workspace rows; users update their own personal rows
CREATE POLICY "Members update own or workspace replies"
ON public.workspace_saved_replies
FOR UPDATE
TO authenticated
USING (
  (scope = 'personal' AND user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (scope = 'workspace' AND public.is_workspace_manager(workspace_id, auth.uid()))
)
WITH CHECK (
  (scope = 'personal' AND user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (scope = 'workspace' AND public.is_workspace_manager(workspace_id, auth.uid()))
);

-- DELETE: same rules as UPDATE
CREATE POLICY "Members delete own or workspace replies"
ON public.workspace_saved_replies
FOR DELETE
TO authenticated
USING (
  (scope = 'personal' AND user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  OR (scope = 'workspace' AND public.is_workspace_manager(workspace_id, auth.uid()))
);
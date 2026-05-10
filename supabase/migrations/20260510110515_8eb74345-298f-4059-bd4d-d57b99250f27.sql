
-- 1) Capture pipeline scope on invite links
ALTER TABLE public.workspace_invite_links
  ADD COLUMN IF NOT EXISTS allowed_pipeline_ids uuid[];

-- 2) Helper: returns NULL when member has full access, else array of allowed pipeline ids
CREATE OR REPLACE FUNCTION public.member_pipeline_scope(_workspace_id uuid, _user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.is_admin(_user_id) THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id AND w.owner_user_id = _user_id) THEN NULL
    ELSE (
      SELECT CASE
        WHEN m.allowed_pipeline_ids IS NULL OR array_length(m.allowed_pipeline_ids, 1) IS NULL THEN NULL
        ELSE m.allowed_pipeline_ids
      END
      FROM public.workspace_members m
      WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id
      LIMIT 1
    )
  END
$$;

-- 3) Helper: can the member see this pipeline?
CREATE OR REPLACE FUNCTION public.can_access_pipeline(_workspace_id uuid, _user_id uuid, _pipeline_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.member_pipeline_scope(_workspace_id, _user_id) IS NULL THEN true
    WHEN _pipeline_id IS NULL THEN false
    ELSE _pipeline_id = ANY(public.member_pipeline_scope(_workspace_id, _user_id))
  END
$$;

-- 4) Tighten workspace-member SELECT policies to honor pipeline scope.
--    For pipeline_id IS NULL rows: visible only to unrestricted members.

-- pipelines
DROP POLICY IF EXISTS "Workspace members view pipelines" ON public.pipelines;
CREATE POLICY "Workspace members view pipelines" ON public.pipelines
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_pipeline(workspace_id, auth.uid(), id)
  );

-- pipeline_stages
DROP POLICY IF EXISTS "Workspace members view stages" ON public.pipeline_stages;
CREATE POLICY "Workspace members view stages" ON public.pipeline_stages
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      pipeline_id IS NULL
        AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

-- conversations
DROP POLICY IF EXISTS "Workspace members view conversations" ON public.conversations;
CREATE POLICY "Workspace members view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members update conversations" ON public.conversations;
CREATE POLICY "Workspace members update conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  )
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

-- deals
DROP POLICY IF EXISTS "Workspace members view deals" ON public.deals;
CREATE POLICY "Workspace members view deals" ON public.deals
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members update deals" ON public.deals;
CREATE POLICY "Workspace members update deals" ON public.deals
  FOR UPDATE
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

DROP POLICY IF EXISTS "Workspace members delete deals" ON public.deals;
CREATE POLICY "Workspace members delete deals" ON public.deals
  FOR DELETE
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

-- messages (via conversation)
DROP POLICY IF EXISTS "Workspace members view messages" ON public.messages;
CREATE POLICY "Workspace members view messages" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND public.is_workspace_member(c.workspace_id, auth.uid())
        AND (
          (c.pipeline_id IS NULL AND public.member_pipeline_scope(c.workspace_id, auth.uid()) IS NULL)
          OR public.can_access_pipeline(c.workspace_id, auth.uid(), c.pipeline_id)
        )
    )
  );

-- campaigns
DROP POLICY IF EXISTS "Workspace members view campaigns" ON public.campaigns;
CREATE POLICY "Workspace members view campaigns" ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      (pipeline_id IS NULL AND public.member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
      OR public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
    )
  );

-- campaign_recipients (via campaign)
DROP POLICY IF EXISTS "Workspace members view recipients" ON public.campaign_recipients;
CREATE POLICY "Workspace members view recipients" ON public.campaign_recipients
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_recipients.campaign_id
        AND (
          (c.pipeline_id IS NULL AND public.member_pipeline_scope(c.workspace_id, auth.uid()) IS NULL)
          OR public.can_access_pipeline(c.workspace_id, auth.uid(), c.pipeline_id)
        )
    )
  );

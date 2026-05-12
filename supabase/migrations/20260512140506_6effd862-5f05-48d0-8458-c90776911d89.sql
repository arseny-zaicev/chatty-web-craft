
-- Drop legacy user_id-only policies and replace with workspace-scoped policies
-- to enforce pipeline scoping consistently and prevent owner-bypass.

-- ===== campaigns =====
DROP POLICY IF EXISTS "Users insert own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users update own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users delete own campaigns" ON public.campaigns;

CREATE POLICY "Workspace members insert campaigns"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
    AND auth.uid() = user_id
    AND ((pipeline_id IS NULL AND member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
         OR can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
  );

CREATE POLICY "Workspace members update campaigns"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (
    is_workspace_member(workspace_id, auth.uid())
    AND ((pipeline_id IS NULL AND member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
         OR can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
  )
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
    AND ((pipeline_id IS NULL AND member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
         OR can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
  );

CREATE POLICY "Workspace managers delete campaigns"
  ON public.campaigns FOR DELETE TO authenticated
  USING (
    is_workspace_manager(workspace_id, auth.uid())
    AND ((pipeline_id IS NULL AND member_pipeline_scope(workspace_id, auth.uid()) IS NULL)
         OR can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
  );

-- ===== campaign_recipients =====
DROP POLICY IF EXISTS "Users insert own campaign recipients" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users update own campaign recipients" ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users delete own campaign recipients" ON public.campaign_recipients;

CREATE POLICY "Workspace members insert recipients"
  ON public.campaign_recipients FOR INSERT TO authenticated
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_recipients.campaign_id
        AND ((c.pipeline_id IS NULL AND member_pipeline_scope(c.workspace_id, auth.uid()) IS NULL)
             OR can_access_pipeline(c.workspace_id, auth.uid(), c.pipeline_id))
    )
  );

CREATE POLICY "Workspace members update recipients"
  ON public.campaign_recipients FOR UPDATE TO authenticated
  USING (
    is_workspace_member(workspace_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_recipients.campaign_id
        AND ((c.pipeline_id IS NULL AND member_pipeline_scope(c.workspace_id, auth.uid()) IS NULL)
             OR can_access_pipeline(c.workspace_id, auth.uid(), c.pipeline_id))
    )
  )
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Workspace managers delete recipients"
  ON public.campaign_recipients FOR DELETE TO authenticated
  USING (
    is_workspace_manager(workspace_id, auth.uid())
  );

-- ===== conversations =====
DROP POLICY IF EXISTS "Users insert own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users delete own conversations" ON public.conversations;

CREATE POLICY "Workspace members insert conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Workspace managers delete conversations"
  ON public.conversations FOR DELETE TO authenticated
  USING (
    is_workspace_manager(workspace_id, auth.uid())
  );

-- ===== deals =====
DROP POLICY IF EXISTS "Users insert own deals" ON public.deals;
DROP POLICY IF EXISTS "Users update own deals" ON public.deals;
DROP POLICY IF EXISTS "Users delete own deals" ON public.deals;

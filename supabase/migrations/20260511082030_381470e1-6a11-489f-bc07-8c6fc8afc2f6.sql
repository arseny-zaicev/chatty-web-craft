
-- =========================================================================
-- Wave A.1 — Drop legacy "Users view own" SELECT policies (workspace policies cover all real access)
-- =========================================================================
DROP POLICY IF EXISTS "Users view own conversations"        ON public.conversations;
DROP POLICY IF EXISTS "Users view own messages"             ON public.messages;
DROP POLICY IF EXISTS "Users view own deals"                ON public.deals;
DROP POLICY IF EXISTS "Users view own campaigns"            ON public.campaigns;
DROP POLICY IF EXISTS "Users view own campaign recipients"  ON public.campaign_recipients;
DROP POLICY IF EXISTS "Users view own stages"               ON public.pipeline_stages;
DROP POLICY IF EXISTS "Users view own templates"            ON public.message_templates;

-- =========================================================================
-- Wave A.2 — Rewrite workspace SELECT policies with (SELECT ...) wrappers
--             so member_pipeline_scope / can_access_pipeline are cached as
--             InitPlans per query (huge win once scope rows exist).
-- =========================================================================

-- conversations
DROP POLICY IF EXISTS "Workspace members view conversations" ON public.conversations;
CREATE POLICY "Workspace members view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

DROP POLICY IF EXISTS "Workspace members update conversations" ON public.conversations;
CREATE POLICY "Workspace members update conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

-- messages (joins conversation)
DROP POLICY IF EXISTS "Workspace members view messages" ON public.messages;
CREATE POLICY "Workspace members view messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (SELECT public.is_workspace_member(c.workspace_id, auth.uid()))
        AND (
          (c.pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(c.workspace_id, auth.uid())) IS NULL)
          OR (SELECT public.can_access_pipeline(c.workspace_id, auth.uid(), c.pipeline_id))
        )
    )
  );

-- deals
DROP POLICY IF EXISTS "Workspace members view deals" ON public.deals;
CREATE POLICY "Workspace members view deals"
  ON public.deals FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

DROP POLICY IF EXISTS "Workspace members update deals" ON public.deals;
CREATE POLICY "Workspace members update deals"
  ON public.deals FOR UPDATE
  USING (
    workspace_id IS NOT NULL
    AND (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

DROP POLICY IF EXISTS "Workspace members delete deals" ON public.deals;
CREATE POLICY "Workspace members delete deals"
  ON public.deals FOR DELETE
  USING (
    workspace_id IS NOT NULL
    AND (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

-- campaigns
DROP POLICY IF EXISTS "Workspace members view campaigns" ON public.campaigns;
CREATE POLICY "Workspace members view campaigns"
  ON public.campaigns FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

-- campaign_recipients (joins campaigns)
DROP POLICY IF EXISTS "Workspace members view recipients" ON public.campaign_recipients;
CREATE POLICY "Workspace members view recipients"
  ON public.campaign_recipients FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_recipients.campaign_id
        AND (
          (c.pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(c.workspace_id, auth.uid())) IS NULL)
          OR (SELECT public.can_access_pipeline(c.workspace_id, auth.uid(), c.pipeline_id))
        )
    )
  );

-- pipeline_stages
DROP POLICY IF EXISTS "Workspace members view stages" ON public.pipeline_stages;
CREATE POLICY "Workspace members view stages"
  ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (
      (pipeline_id IS NULL AND (SELECT public.member_pipeline_scope(workspace_id, auth.uid())) IS NULL)
      OR (SELECT public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id))
    )
  );

-- pipelines
DROP POLICY IF EXISTS "Workspace members view pipelines" ON public.pipelines;
CREATE POLICY "Workspace members view pipelines"
  ON public.pipelines FOR SELECT TO authenticated
  USING (
    (SELECT public.is_workspace_member(workspace_id, auth.uid()))
    AND (SELECT public.can_access_pipeline(workspace_id, auth.uid(), id))
  );

-- =========================================================================
-- Wave A.3 — index for trigger-driven lead_imports updates by conversation_id
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_lead_imports_conversation_id
  ON public.lead_imports (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- =========================================================================
-- Wave A.4 — slack_event_queue: explicit max_attempts + failed-monitor index
-- =========================================================================
ALTER TABLE public.slack_event_queue
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS idx_slack_event_queue_failed
  ON public.slack_event_queue (created_at DESC)
  WHERE status = 'failed';

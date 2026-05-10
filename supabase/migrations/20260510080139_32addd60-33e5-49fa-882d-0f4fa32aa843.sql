
-- 1) pipelines table
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipelines_workspace ON public.pipelines(workspace_id);
CREATE UNIQUE INDEX uniq_pipelines_default_per_ws ON public.pipelines(workspace_id) WHERE is_default;

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view pipelines"
ON public.pipelines FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Managers insert pipelines"
ON public.pipelines FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Managers update pipelines"
ON public.pipelines FOR UPDATE TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Managers delete pipelines"
ON public.pipelines FOR DELETE TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()) AND NOT is_default);

CREATE TRIGGER set_pipelines_updated_at
BEFORE UPDATE ON public.pipelines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add pipeline_id columns
ALTER TABLE public.pipeline_stages ADD COLUMN pipeline_id uuid;
ALTER TABLE public.deals ADD COLUMN pipeline_id uuid;
ALTER TABLE public.conversations ADD COLUMN pipeline_id uuid;
ALTER TABLE public.campaigns ADD COLUMN pipeline_id uuid;
ALTER TABLE public.workspace_members ADD COLUMN allowed_pipeline_ids uuid[];

-- 3) Backfill: one default "Main" pipeline per workspace
INSERT INTO public.pipelines (workspace_id, user_id, name, color, position, is_default)
SELECT w.id, w.owner_user_id, 'Main', '#6366f1', 0, true
FROM public.workspaces w
ON CONFLICT DO NOTHING;

-- Backfill stages, deals, conversations, campaigns to default board
UPDATE public.pipeline_stages s
SET pipeline_id = p.id
FROM public.pipelines p
WHERE p.is_default = true AND p.workspace_id = s.workspace_id AND s.pipeline_id IS NULL;

UPDATE public.deals d
SET pipeline_id = p.id
FROM public.pipelines p
WHERE p.is_default = true AND p.workspace_id = d.workspace_id AND d.pipeline_id IS NULL;

UPDATE public.conversations c
SET pipeline_id = p.id
FROM public.pipelines p
WHERE p.is_default = true AND p.workspace_id = c.workspace_id AND c.pipeline_id IS NULL;

UPDATE public.campaigns ca
SET pipeline_id = p.id
FROM public.pipelines p
WHERE p.is_default = true AND p.workspace_id = ca.workspace_id AND ca.pipeline_id IS NULL;

-- 4) Indexes
CREATE INDEX idx_pipeline_stages_pipeline ON public.pipeline_stages(pipeline_id);
CREATE INDEX idx_deals_pipeline ON public.deals(pipeline_id);
CREATE INDEX idx_conversations_pipeline ON public.conversations(pipeline_id);
CREATE INDEX idx_campaigns_pipeline ON public.campaigns(pipeline_id);

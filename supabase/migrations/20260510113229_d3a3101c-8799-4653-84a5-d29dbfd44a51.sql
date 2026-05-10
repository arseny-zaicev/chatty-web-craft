-- 1. Pipeline outreach + notification config
ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS auto_outreach_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_touch_template_id uuid,
  ADD COLUMN IF NOT EXISTS default_sender_number_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sending_window jsonb,
  ADD COLUMN IF NOT EXISTS daily_cap integer,
  ADD COLUMN IF NOT EXISTS slack_channel_id text;

-- 2. source_connections
CREATE TABLE IF NOT EXISTS public.source_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('webhook','google_sheet','csv_upload','apps_script','api')),
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  secret_token text NOT NULL UNIQUE,
  last_error text,
  last_ingest_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_source_connections_pipeline ON public.source_connections(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_source_connections_workspace ON public.source_connections(workspace_id);
ALTER TABLE public.source_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view sources" ON public.source_connections
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
  );
CREATE POLICY "Managers insert sources" ON public.source_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "Managers update sources" ON public.source_connections
  FOR UPDATE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Managers delete sources" ON public.source_connections
  FOR DELETE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE TRIGGER trg_source_connections_updated
  BEFORE UPDATE ON public.source_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. import_batches
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  source_connection_id uuid REFERENCES public.source_connections(id) ON DELETE SET NULL,
  source_kind text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','processing','completed','failed')),
  total integer NOT NULL DEFAULT 0,
  accepted integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_pipeline ON public.import_batches(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_workspace_started ON public.import_batches(workspace_id, started_at DESC);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view batches" ON public.import_batches
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
  );

-- 4. lead_imports
CREATE TABLE IF NOT EXISTS public.lead_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  source_connection_id uuid REFERENCES public.source_connections(id) ON DELETE SET NULL,
  external_id text,
  phone text NOT NULL,
  name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_id uuid,
  deal_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','routed','duplicate','invalid','awaiting_manual','contacted','failed')),
  error text,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_imports_pipeline ON public.lead_imports(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_lead_imports_batch ON public.lead_imports(batch_id);
CREATE INDEX IF NOT EXISTS idx_lead_imports_phone ON public.lead_imports(workspace_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_lead_imports_source_external
  ON public.lead_imports(source_connection_id, external_id)
  WHERE source_connection_id IS NOT NULL AND external_id IS NOT NULL;
ALTER TABLE public.lead_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view lead imports" ON public.lead_imports
  FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND public.can_access_pipeline(workspace_id, auth.uid(), pipeline_id)
  );
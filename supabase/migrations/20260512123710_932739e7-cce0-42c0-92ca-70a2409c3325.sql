CREATE TABLE public.template_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  template_names text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX idx_template_groups_workspace ON public.template_groups(workspace_id);

ALTER TABLE public.template_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace managers view template groups"
ON public.template_groups FOR SELECT TO authenticated
USING (is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Workspace managers insert template groups"
ON public.template_groups FOR INSERT TO authenticated
WITH CHECK (is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Workspace managers update template groups"
ON public.template_groups FOR UPDATE TO authenticated
USING (is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Workspace managers delete template groups"
ON public.template_groups FOR DELETE TO authenticated
USING (is_workspace_manager(workspace_id, auth.uid()));

CREATE TRIGGER trg_template_groups_updated_at
BEFORE UPDATE ON public.template_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
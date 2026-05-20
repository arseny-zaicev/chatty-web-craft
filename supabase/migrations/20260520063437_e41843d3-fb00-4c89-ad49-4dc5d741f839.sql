-- Admin-curated whitelist of template groups exposed as quick-reply buttons in inbox composer.
CREATE TABLE public.workspace_quick_template_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  template_group_id uuid NOT NULL REFERENCES public.template_groups(id) ON DELETE CASCADE,
  label text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, template_group_id)
);

CREATE INDEX idx_wqtg_workspace ON public.workspace_quick_template_groups (workspace_id, position);

ALTER TABLE public.workspace_quick_template_groups ENABLE ROW LEVEL SECURITY;

-- All workspace members can SEE the quick reply buttons.
CREATE POLICY "Workspace members view quick template groups"
ON public.workspace_quick_template_groups FOR SELECT
TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

-- Only global admins can curate the list.
CREATE POLICY "Admins insert quick template groups"
ON public.workspace_quick_template_groups FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins update quick template groups"
ON public.workspace_quick_template_groups FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins delete quick template groups"
ON public.workspace_quick_template_groups FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));
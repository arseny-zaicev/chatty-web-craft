
-- ============= workspace_saved_replies =============
CREATE TABLE public.workspace_saved_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  folder text,
  tags text[] NOT NULL DEFAULT '{}',
  is_favorite boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wsr_workspace ON public.workspace_saved_replies(workspace_id);
ALTER TABLE public.workspace_saved_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view saved replies"
  ON public.workspace_saved_replies FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members insert saved replies"
  ON public.workspace_saved_replies FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Workspace members update saved replies"
  ON public.workspace_saved_replies FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members delete saved replies"
  ON public.workspace_saved_replies FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER update_workspace_saved_replies_updated_at
  BEFORE UPDATE ON public.workspace_saved_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============= workspace_library_fields =============
CREATE TABLE public.workspace_library_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','long_text','link')),
  value text,
  is_builtin boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);
CREATE INDEX idx_wlf_workspace ON public.workspace_library_fields(workspace_id);
ALTER TABLE public.workspace_library_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view library fields"
  ON public.workspace_library_fields FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members insert library fields"
  ON public.workspace_library_fields FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members update library fields"
  ON public.workspace_library_fields FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members delete library fields"
  ON public.workspace_library_fields FOR DELETE
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND is_builtin = false);

CREATE TRIGGER update_workspace_library_fields_updated_at
  BEFORE UPDATE ON public.workspace_library_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

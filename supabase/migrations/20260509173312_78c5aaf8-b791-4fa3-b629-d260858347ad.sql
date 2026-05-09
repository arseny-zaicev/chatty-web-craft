
CREATE TABLE public.audience_prep_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  campaign_type text NOT NULL DEFAULT 'marketing',
  template_label text,
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  optional_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  derived_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  invalid_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  fallback_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  quick_replies jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prep_profiles_ws ON public.audience_prep_profiles(workspace_id);

ALTER TABLE public.audience_prep_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers view prep profiles" ON public.audience_prep_profiles
  FOR SELECT TO authenticated USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Managers insert prep profiles" ON public.audience_prep_profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = user_id);
CREATE POLICY "Managers update prep profiles" ON public.audience_prep_profiles
  FOR UPDATE TO authenticated USING (public.is_workspace_manager(workspace_id, auth.uid()));
CREATE POLICY "Managers delete prep profiles" ON public.audience_prep_profiles
  FOR DELETE TO authenticated USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE TRIGGER trg_prep_profiles_updated_at
  BEFORE UPDATE ON public.audience_prep_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.audience_batches
  ADD COLUMN prep_profile_id uuid REFERENCES public.audience_prep_profiles(id) ON DELETE SET NULL,
  ADD COLUMN is_launch_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN derived_variables_preview jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.audience_rows
  ADD COLUMN derived_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

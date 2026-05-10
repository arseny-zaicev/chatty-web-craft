
-- Business Managers registry
CREATE TABLE public.business_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'gupshup',
  external_id text,
  owner_email text,
  notes text,
  status text NOT NULL DEFAULT 'warming',
  warmup_started_at timestamptz,
  warmup_target_date date,
  warmup_stage text,
  daily_warmup_cap integer,
  current_day_sent integer NOT NULL DEFAULT 0,
  health_score integer NOT NULL DEFAULT 0,
  last_warmup_action_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX idx_bm_workspace ON public.business_managers(workspace_id);
CREATE INDEX idx_bm_status ON public.business_managers(status);

ALTER TABLE public.business_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view BMs"
  ON public.business_managers FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Managers insert BMs"
  ON public.business_managers FOR INSERT TO authenticated
  WITH CHECK (is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Managers update BMs"
  ON public.business_managers FOR UPDATE TO authenticated
  USING (is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Managers delete BMs"
  ON public.business_managers FOR DELETE TO authenticated
  USING (is_workspace_manager(workspace_id, auth.uid()));

CREATE TRIGGER trg_bm_updated_at
  BEFORE UPDATE ON public.business_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Warmup events log
CREATE TABLE public.business_manager_warmup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_manager_id uuid NOT NULL REFERENCES public.business_managers(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bm_events_bm ON public.business_manager_warmup_events(business_manager_id, created_at DESC);

ALTER TABLE public.business_manager_warmup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view BM events"
  ON public.business_manager_warmup_events FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Managers insert BM events"
  ON public.business_manager_warmup_events FOR INSERT TO authenticated
  WITH CHECK (is_workspace_manager(workspace_id, auth.uid()));

-- FK on whatsapp_numbers
ALTER TABLE public.whatsapp_numbers
  ADD COLUMN business_manager_id uuid REFERENCES public.business_managers(id) ON DELETE SET NULL;

CREATE INDEX idx_whatsapp_numbers_bm ON public.whatsapp_numbers(business_manager_id);

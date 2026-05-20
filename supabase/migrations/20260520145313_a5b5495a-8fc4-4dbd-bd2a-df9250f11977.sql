CREATE TABLE IF NOT EXISTS public.workspace_send_guards (
  workspace_id uuid PRIMARY KEY,
  hard_daily_cap integer NOT NULL CHECK (hard_daily_cap >= 0),
  hard_per_campaign_cap integer NOT NULL CHECK (hard_per_campaign_cap >= 0),
  force_paced boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_send_guards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read workspace send guards"
  ON public.workspace_send_guards FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Service role manages workspace send guards"
  ON public.workspace_send_guards FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_workspace_send_guards_updated
  BEFORE UPDATE ON public.workspace_send_guards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE IF NOT EXISTS public.fleet_health_snapshots (
  id integer PRIMARY KEY DEFAULT 1,
  captured_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fleet_health_snapshots_singleton CHECK (id = 1)
);

ALTER TABLE public.fleet_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read fleet health snapshots"
ON public.fleet_health_snapshots FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "service manages fleet health snapshots"
ON public.fleet_health_snapshots FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Categories of Gupshup notification emails we recognise
DO $$ BEGIN
  CREATE TYPE public.gupshup_mail_category AS ENUM (
    'quality_drop','restriction','block','template_rejected','template_approved',
    'billing','account_review','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gupshup_mail_severity AS ENUM ('info','warning','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.gupshup_mail_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_id text NOT NULL UNIQUE,
  thread_id text,
  received_at timestamptz NOT NULL,
  from_address text,
  subject text,
  snippet text,
  category public.gupshup_mail_category NOT NULL DEFAULT 'other',
  severity public.gupshup_mail_severity NOT NULL DEFAULT 'info',
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  slack_event_id uuid REFERENCES public.slack_event_queue(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gupshup_mail_log_received_idx ON public.gupshup_mail_log (received_at DESC);
CREATE INDEX IF NOT EXISTS gupshup_mail_log_severity_idx ON public.gupshup_mail_log (severity, received_at DESC);
CREATE INDEX IF NOT EXISTS gupshup_mail_log_number_idx  ON public.gupshup_mail_log (whatsapp_number_id);

ALTER TABLE public.gupshup_mail_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read gupshup mail" ON public.gupshup_mail_log;
CREATE POLICY "admins read gupshup mail"
  ON public.gupshup_mail_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "service writes gupshup mail" ON public.gupshup_mail_log;
CREATE POLICY "service writes gupshup mail"
  ON public.gupshup_mail_log FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.gupshup_mail_state (
  id integer PRIMARY KEY DEFAULT 1,
  last_internal_date_ms bigint NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_error text,
  CONSTRAINT gupshup_mail_state_singleton CHECK (id = 1)
);

INSERT INTO public.gupshup_mail_state (id, last_internal_date_ms)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.gupshup_mail_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read gupshup state" ON public.gupshup_mail_state;
CREATE POLICY "admins read gupshup state"
  ON public.gupshup_mail_state FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "service manages gupshup state" ON public.gupshup_mail_state;
CREATE POLICY "service manages gupshup state"
  ON public.gupshup_mail_state FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

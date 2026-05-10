
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL,
  app_name text,
  destination text,
  source text,
  event_type text,
  payload jsonb NOT NULL,
  matched_whatsapp_number_id uuid,
  replay_status text NOT NULL DEFAULT 'pending',
  replay_error text,
  replayed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wwf_status_created ON public.whatsapp_webhook_failures (replay_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwf_app_name ON public.whatsapp_webhook_failures (app_name);
CREATE INDEX IF NOT EXISTS idx_wwf_destination ON public.whatsapp_webhook_failures (destination);

ALTER TABLE public.whatsapp_webhook_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read failures"
  ON public.whatsapp_webhook_failures
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins update failures"
  ON public.whatsapp_webhook_failures
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete failures"
  ON public.whatsapp_webhook_failures
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Add 'deleted' to message_status enum (idempotent)
DO $$ BEGIN
  ALTER TYPE public.message_status ADD VALUE IF NOT EXISTS 'deleted';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Provider events table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  provider_message_id text,
  workspace_id uuid,
  whatsapp_number_id uuid,
  message_id uuid,
  campaign_recipient_id uuid,
  error_code text,
  error_message text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wme_provider_msg ON public.whatsapp_message_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wme_number ON public.whatsapp_message_events(whatsapp_number_id);
CREATE INDEX IF NOT EXISTS idx_wme_workspace ON public.whatsapp_message_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wme_message ON public.whatsapp_message_events(message_id);
CREATE INDEX IF NOT EXISTS idx_wme_recipient ON public.whatsapp_message_events(campaign_recipient_id);
CREATE INDEX IF NOT EXISTS idx_wme_received ON public.whatsapp_message_events(received_at DESC);

ALTER TABLE public.whatsapp_message_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members view events" ON public.whatsapp_message_events;
CREATE POLICY "Workspace members view events"
  ON public.whatsapp_message_events FOR SELECT
  TO authenticated
  USING (workspace_id IS NULL AND public.is_admin(auth.uid()) OR public.is_workspace_member(workspace_id, auth.uid()));

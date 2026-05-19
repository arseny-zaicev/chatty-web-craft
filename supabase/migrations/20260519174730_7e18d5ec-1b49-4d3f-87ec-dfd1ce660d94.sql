
-- Raw-first webhook capture table
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  type text,
  app_name text,
  destination text,
  source text,
  provider_message_id text,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  processed_at timestamptz,
  error_message text,
  error_stack text,
  retry_count integer NOT NULL DEFAULT 0,
  last_retried_at timestamptz,
  last_retried_by uuid,
  message_id uuid,
  workspace_id uuid,
  whatsapp_number_id uuid
);

CREATE INDEX IF NOT EXISTS idx_wwr_received_at ON public.whatsapp_webhook_raw (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwr_status ON public.whatsapp_webhook_raw (processing_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwr_provider_msg ON public.whatsapp_webhook_raw (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wwr_app_source ON public.whatsapp_webhook_raw (app_name, source);
CREATE INDEX IF NOT EXISTS idx_wwr_workspace ON public.whatsapp_webhook_raw (workspace_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwr_payload_gin ON public.whatsapp_webhook_raw USING gin (payload);

ALTER TABLE public.whatsapp_webhook_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service manages webhook raw"
ON public.whatsapp_webhook_raw FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admins read webhook raw"
ON public.whatsapp_webhook_raw FOR SELECT TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "workspace managers read webhook raw"
ON public.whatsapp_webhook_raw FOR SELECT TO authenticated
USING (workspace_id IS NOT NULL AND is_workspace_manager(workspace_id, auth.uid()));

-- Retention: delete rows older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_webhook_raw()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.whatsapp_webhook_raw WHERE received_at < now() - interval '90 days';
$$;

ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS last_health_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_sync_error text,
  ADD COLUMN IF NOT EXISTS quality_rating text;
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_health_sync ON public.whatsapp_numbers(last_health_sync_at) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_numbers_provider_app_id_key
  ON public.whatsapp_numbers (provider_app_id)
  WHERE provider_app_id IS NOT NULL;

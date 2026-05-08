-- Number status + usage enums
DO $$ BEGIN
  CREATE TYPE public.whatsapp_number_status AS ENUM ('draft','ready','warming','restricted','banned','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.whatsapp_number_usage AS ENUM ('marketing','utility','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS status public.whatsapp_number_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS usage_type public.whatsapp_number_usage NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS webhook_connected boolean NOT NULL DEFAULT false;

-- Prevent ambiguous assignment: a phone can only belong to one workspace at a time
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_numbers_phone_unique
  ON public.whatsapp_numbers (phone_number);

-- Helpful index for workspace scoping
CREATE INDEX IF NOT EXISTS whatsapp_numbers_workspace_idx
  ON public.whatsapp_numbers (workspace_id);

-- Backfill: any existing active number with provider_app_id treated as 'ready' baseline,
-- otherwise leave as draft. Inactive numbers become 'inactive'.
UPDATE public.whatsapp_numbers
SET status = CASE
  WHEN is_active = false THEN 'inactive'::public.whatsapp_number_status
  WHEN provider_app_id IS NOT NULL AND phone_number IS NOT NULL THEN 'ready'::public.whatsapp_number_status
  ELSE 'draft'::public.whatsapp_number_status
END
WHERE status = 'draft';

-- Backfill webhook_connected from connected_in_gupshup as a starting signal
UPDATE public.whatsapp_numbers
SET webhook_connected = COALESCE(connected_in_gupshup, false)
WHERE webhook_connected = false;
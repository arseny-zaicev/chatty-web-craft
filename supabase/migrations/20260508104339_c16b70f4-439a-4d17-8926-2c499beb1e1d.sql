
ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS partner_source text,
  ADD COLUMN IF NOT EXISTS bm_name text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS connected_in_gupshup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connected_in_iskra boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'replied'
                 AND enumtypid = 'public.campaign_recipient_status'::regtype) THEN
    ALTER TYPE public.campaign_recipient_status ADD VALUE 'replied';
  END IF;
END $$;

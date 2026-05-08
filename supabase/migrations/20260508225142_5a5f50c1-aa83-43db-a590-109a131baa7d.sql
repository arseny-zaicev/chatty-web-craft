ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS display_name_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_name_checked_at timestamp with time zone;
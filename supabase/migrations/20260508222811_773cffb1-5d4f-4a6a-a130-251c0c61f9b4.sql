ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS profile_avatar text,
  ADD COLUMN IF NOT EXISTS messaging_limit text,
  ADD COLUMN IF NOT EXISTS is_warming boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provided_by text,
  ADD COLUMN IF NOT EXISTS assigned_ref text;
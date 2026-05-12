ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS variables_sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS header_text text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS sync_warning text;
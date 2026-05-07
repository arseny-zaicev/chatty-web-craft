ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality text,
  ADD COLUMN IF NOT EXISTS namespace text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS raw jsonb,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;
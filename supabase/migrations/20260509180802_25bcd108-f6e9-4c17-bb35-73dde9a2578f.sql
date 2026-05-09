ALTER TABLE public.audience_prep_profiles
  ADD COLUMN IF NOT EXISTS sample_message_template text;

ALTER TABLE public.audience_batches
  ADD COLUMN IF NOT EXISTS column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;
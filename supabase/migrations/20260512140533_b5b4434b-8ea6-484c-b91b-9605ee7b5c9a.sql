
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS last_notified_status text;

-- Initialize to current status so we don't spam old transitions on first run after deploy.
UPDATE public.message_templates SET last_notified_status = status WHERE last_notified_status IS NULL;

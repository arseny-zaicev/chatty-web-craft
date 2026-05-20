-- Prevent duplicate active partner ownership rows for the same number.
-- A number may have many historical rows (effective_to set), but only one
-- currently-active row (effective_to IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS number_ownership_one_active_per_number
  ON public.number_ownership (whatsapp_number_id)
  WHERE effective_to IS NULL;
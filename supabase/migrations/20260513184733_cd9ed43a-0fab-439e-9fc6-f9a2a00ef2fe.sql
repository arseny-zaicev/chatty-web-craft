ALTER TABLE public.payout_runs
  ADD COLUMN IF NOT EXISTS partner_pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS manager_pdf_storage_path text;
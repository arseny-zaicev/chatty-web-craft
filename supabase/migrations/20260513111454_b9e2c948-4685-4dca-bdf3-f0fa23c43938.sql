ALTER TABLE public.business_managers
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';

CREATE INDEX IF NOT EXISTS idx_bm_verification_status ON public.business_managers(verification_status);
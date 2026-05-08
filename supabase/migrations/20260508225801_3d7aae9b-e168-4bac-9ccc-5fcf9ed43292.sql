ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS display_name_status text NOT NULL DEFAULT 'pending';

UPDATE public.whatsapp_numbers
  SET display_name_status = CASE WHEN display_name_approved THEN 'approved' ELSE 'pending' END
  WHERE display_name_status = 'pending';

ALTER TABLE public.whatsapp_numbers DROP COLUMN IF EXISTS display_name_approved;

ALTER TABLE public.whatsapp_numbers
  ADD CONSTRAINT whatsapp_numbers_dn_status_chk
  CHECK (display_name_status IN ('pending','approved','rejected'));
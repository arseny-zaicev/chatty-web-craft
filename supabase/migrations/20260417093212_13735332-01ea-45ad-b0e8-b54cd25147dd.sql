
-- Add new form type for BM access submissions
ALTER TYPE form_type ADD VALUE IF NOT EXISTS 'bm_access';

-- Create private storage bucket for BM screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bm-screenshots',
  'bm-screenshots',
  false,
  10485760, -- 10MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies: anyone can upload (form is public), only admins can read/delete
CREATE POLICY "Anyone can upload BM screenshots"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'bm-screenshots');

CREATE POLICY "Only admins can view BM screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'bm-screenshots' AND public.is_admin(auth.uid()));

CREATE POLICY "Only admins can delete BM screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'bm-screenshots' AND public.is_admin(auth.uid()));

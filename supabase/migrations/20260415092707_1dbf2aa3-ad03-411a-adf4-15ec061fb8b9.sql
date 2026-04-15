INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonials', 'testimonials', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for testimonials"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'testimonials');
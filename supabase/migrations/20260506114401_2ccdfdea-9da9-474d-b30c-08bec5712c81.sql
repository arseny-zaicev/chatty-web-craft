DROP POLICY IF EXISTS "Anyone can upload BM screenshots" ON storage.objects;

CREATE POLICY "Anon can upload BM screenshots to UUID prefix"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'bm-screenshots'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
);
-- Make conversation-screenshots bucket public for viewing
UPDATE storage.buckets 
SET public = true 
WHERE id = 'conversation-screenshots';

-- Create storage policies for conversation-screenshots bucket
-- Allow anyone to view screenshots (bucket is now public)
CREATE POLICY "Anyone can view conversation screenshots" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'conversation-screenshots');

-- Allow admins to upload screenshots
CREATE POLICY "Admins can upload screenshots" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'conversation-screenshots' 
  AND public.is_admin(auth.uid())
);

-- Allow admins to update screenshots
CREATE POLICY "Admins can update screenshots" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'conversation-screenshots' 
  AND public.is_admin(auth.uid())
);

-- Allow admins to delete screenshots
CREATE POLICY "Admins can delete screenshots" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'conversation-screenshots' 
  AND public.is_admin(auth.uid())
);
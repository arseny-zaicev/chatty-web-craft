-- Create storage bucket for conversation screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('conversation-screenshots', 'conversation-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload screenshots
CREATE POLICY "Authenticated users can upload screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'conversation-screenshots');

-- Allow authenticated users to view screenshots
CREATE POLICY "Authenticated users can view screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'conversation-screenshots');

-- Allow authenticated users to delete their screenshots
CREATE POLICY "Authenticated users can delete screenshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'conversation-screenshots');
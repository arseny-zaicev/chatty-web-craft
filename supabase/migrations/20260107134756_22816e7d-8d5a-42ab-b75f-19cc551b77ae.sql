-- Make the conversation-screenshots bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'conversation-screenshots';

-- Drop the permissive analytics insert policy
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.form_analytics;

-- Create a new policy that only allows service_role to insert analytics
-- (This means only the Edge Function can insert analytics data)
CREATE POLICY "Service role can insert analytics"
ON public.form_analytics FOR INSERT
TO service_role
WITH CHECK (true);
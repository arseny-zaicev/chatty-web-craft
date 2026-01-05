-- Create table for form analytics/funnel tracking
CREATE TABLE public.form_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  session_id TEXT NOT NULL,
  form_type TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'step_viewed', -- step_viewed, step_completed, form_submitted, form_abandoned
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.form_analytics ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert analytics (anonymous tracking)
CREATE POLICY "Anyone can insert analytics"
ON public.form_analytics
FOR INSERT
WITH CHECK (true);

-- Only admin can view analytics
CREATE POLICY "Admin can view analytics"
ON public.form_analytics
FOR SELECT
USING (is_admin(auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_form_analytics_form_type ON public.form_analytics(form_type);
CREATE INDEX idx_form_analytics_session ON public.form_analytics(session_id);
CREATE INDEX idx_form_analytics_created ON public.form_analytics(created_at DESC);
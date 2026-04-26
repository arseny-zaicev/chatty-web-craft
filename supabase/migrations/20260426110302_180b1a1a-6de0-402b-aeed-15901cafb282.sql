CREATE TABLE public.ai_seo_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  website_url TEXT NOT NULL,
  company_name TEXT,
  industry TEXT,
  lost_monthly_impressions INTEGER DEFAULT 0,
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'analyzing',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_seo_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports"
  ON public.ai_seo_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reports"
  ON public.ai_seo_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports"
  ON public.ai_seo_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports"
  ON public.ai_seo_reports FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all reports"
  ON public.ai_seo_reports FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE TRIGGER update_ai_seo_reports_updated_at
  BEFORE UPDATE ON public.ai_seo_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ai_seo_reports_user_id ON public.ai_seo_reports(user_id);
CREATE INDEX idx_ai_seo_reports_created_at ON public.ai_seo_reports(created_at DESC);
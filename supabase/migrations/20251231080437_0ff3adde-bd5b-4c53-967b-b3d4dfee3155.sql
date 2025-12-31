-- Store imported leads (e.g., from Google Sheets CSV) per client
CREATE TABLE IF NOT EXISTS public.client_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  row_index INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_leads_user_id ON public.client_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_client_leads_client_id ON public.client_leads(client_id);

ALTER TABLE public.client_leads ENABLE ROW LEVEL SECURITY;

-- RLS: only the owner (user_id) can access their imported leads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'client_leads' 
      AND policyname = 'Users can view their own client leads'
  ) THEN
    CREATE POLICY "Users can view their own client leads"
    ON public.client_leads
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'client_leads' 
      AND policyname = 'Users can insert their own client leads'
  ) THEN
    CREATE POLICY "Users can insert their own client leads"
    ON public.client_leads
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'client_leads' 
      AND policyname = 'Users can update their own client leads'
  ) THEN
    CREATE POLICY "Users can update their own client leads"
    ON public.client_leads
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'client_leads' 
      AND policyname = 'Users can delete their own client leads'
  ) THEN
    CREATE POLICY "Users can delete their own client leads"
    ON public.client_leads
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_client_leads_updated_at ON public.client_leads;
CREATE TRIGGER update_client_leads_updated_at
BEFORE UPDATE ON public.client_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS (safe if already enabled)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Clients CRUD policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='clients' AND policyname='Users can create their own client data'
  ) THEN
    EXECUTE 'DROP POLICY "Users can create their own client data" ON public.clients';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='clients' AND policyname='Users can update their own client data'
  ) THEN
    EXECUTE 'DROP POLICY "Users can update their own client data" ON public.clients';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='clients' AND policyname='Users can delete their own client data'
  ) THEN
    EXECUTE 'DROP POLICY "Users can delete their own client data" ON public.clients';
  END IF;
END $$;

CREATE POLICY "Users can create their own client data"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own client data"
ON public.clients
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own client data"
ON public.clients
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- updated_at triggers (public schema only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clients_updated_at') THEN
    EXECUTE 'CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_profiles_updated_at') THEN
    EXECUTE 'CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();';
  END IF;
END $$;

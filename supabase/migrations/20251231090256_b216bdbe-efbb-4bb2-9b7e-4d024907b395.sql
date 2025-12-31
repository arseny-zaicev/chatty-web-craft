ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients (email);
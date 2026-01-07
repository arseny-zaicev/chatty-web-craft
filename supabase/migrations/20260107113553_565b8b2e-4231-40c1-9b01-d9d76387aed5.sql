-- Remove plaintext password storage from clients table
ALTER TABLE public.clients DROP COLUMN IF EXISTS password;
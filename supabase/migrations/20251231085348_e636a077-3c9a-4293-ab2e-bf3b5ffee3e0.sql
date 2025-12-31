-- Add password column to clients table for admin convenience
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password TEXT;
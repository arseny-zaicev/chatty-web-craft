-- Create enum for form types
CREATE TYPE public.form_type AS ENUM ('qualification', 'seller_leads');

-- Create enum for submission status
CREATE TYPE public.submission_status AS ENUM ('new', 'contacted', 'converted', 'rejected');

-- Create form_submissions table
CREATE TABLE public.form_submissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    form_type public.form_type NOT NULL,
    status public.submission_status NOT NULL DEFAULT 'new',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    contact_company TEXT,
    contact_website TEXT,
    notes TEXT
);

-- Enable RLS
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM auth.users 
        WHERE id = _user_id 
        AND email = 'arseny@iskra.ae'
    )
$$;

-- RLS policies - only admin can access
CREATE POLICY "Admin can view all submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admin can update submissions"
ON public.form_submissions
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admin can delete submissions"
ON public.form_submissions
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Allow public insert (for form submissions without auth)
CREATE POLICY "Anyone can submit forms"
ON public.form_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_form_submissions_updated_at
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
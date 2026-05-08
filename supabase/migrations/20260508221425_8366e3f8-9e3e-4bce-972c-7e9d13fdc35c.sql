-- Allow unassigned numbers (Fleet-managed)
ALTER TABLE public.whatsapp_numbers ALTER COLUMN workspace_id DROP NOT NULL;

-- Admins can view unassigned numbers
DROP POLICY IF EXISTS "Admins view unassigned numbers" ON public.whatsapp_numbers;
CREATE POLICY "Admins view unassigned numbers"
ON public.whatsapp_numbers
FOR SELECT
TO authenticated
USING (workspace_id IS NULL AND public.is_admin(auth.uid()));

-- Admins can update unassigned numbers (so they can later allocate them)
DROP POLICY IF EXISTS "Admins update unassigned numbers" ON public.whatsapp_numbers;
CREATE POLICY "Admins update unassigned numbers"
ON public.whatsapp_numbers
FOR UPDATE
TO authenticated
USING (workspace_id IS NULL AND public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Admins can delete unassigned numbers
DROP POLICY IF EXISTS "Admins delete unassigned numbers" ON public.whatsapp_numbers;
CREATE POLICY "Admins delete unassigned numbers"
ON public.whatsapp_numbers
FOR DELETE
TO authenticated
USING (workspace_id IS NULL AND public.is_admin(auth.uid()));
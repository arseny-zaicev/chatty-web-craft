CREATE POLICY "Workspace members view numbers"
ON public.whatsapp_numbers
FOR SELECT
TO authenticated
USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));
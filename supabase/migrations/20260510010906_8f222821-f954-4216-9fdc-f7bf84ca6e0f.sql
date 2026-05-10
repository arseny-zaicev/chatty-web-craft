CREATE POLICY "Workspace members update deals"
ON public.deals
FOR UPDATE
USING (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members delete deals"
ON public.deals
FOR DELETE
USING (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members insert deals"
ON public.deals
FOR INSERT
WITH CHECK (workspace_id IS NOT NULL AND is_workspace_member(workspace_id, auth.uid()));
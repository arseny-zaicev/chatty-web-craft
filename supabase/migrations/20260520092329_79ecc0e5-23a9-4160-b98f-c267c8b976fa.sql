UPDATE public.workspaces
SET owner_user_id = '18b05c7b-6a50-436e-bcf4-7cb3c1917312'
WHERE id = '29596031-d3dd-4f1d-88c4-9bc31154f428';

UPDATE public.workspace_members
SET role = 'client'
WHERE workspace_id = '29596031-d3dd-4f1d-88c4-9bc31154f428'
  AND user_id = '6d373ea0-cc06-4408-b138-86dd5c4507c5';
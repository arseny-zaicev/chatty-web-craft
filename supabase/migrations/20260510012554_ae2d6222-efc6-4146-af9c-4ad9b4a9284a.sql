ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS can_view_stats boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspace_members.can_view_stats IS
  'For client/member role: when true they can see Overview and Campaigns (read-only). Managers always see them.';
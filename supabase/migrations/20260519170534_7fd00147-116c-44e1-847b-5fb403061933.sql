ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS perm_stats boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_stats_all boolean NOT NULL DEFAULT false;

UPDATE public.workspace_members
  SET perm_stats = true, perm_stats_all = true
  WHERE perm_settings = true OR role = 'manager';

UPDATE public.workspace_members
  SET perm_stats = true
  WHERE perm_stats = false AND perm_inbox = true;
-- 1. Workspaces
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT '#10b981',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, slug)
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Helper: is the user a member of the workspace (or admin)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
      OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = _workspace_id AND w.owner_user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = _workspace_id AND m.user_id = _user_id);
$$;

-- Workspace RLS
CREATE POLICY "Members view workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR owner_user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = id AND m.user_id = auth.uid()));

CREATE POLICY "Owners insert workspaces" ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Owners update workspaces" ON public.workspaces
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Owners delete workspaces" ON public.workspaces
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Members RLS
CREATE POLICY "Members view their memberships" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid())
         OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_user_id = auth.uid()));

CREATE POLICY "Owners manage memberships" ON public.workspace_members
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())
         OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_user_id = auth.uid()))
  WITH CHECK (public.is_admin(auth.uid())
         OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_user_id = auth.uid()));

CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Backfill: create a default workspace per existing user_id from whatsapp_numbers, then attach
INSERT INTO public.workspaces (owner_user_id, name, slug, color)
SELECT DISTINCT user_id, 'Main workspace', 'main', '#10b981'
FROM public.whatsapp_numbers
ON CONFLICT DO NOTHING;

-- Also create a workspace for any user who has no numbers but has profile (so admin can attach later)
INSERT INTO public.workspaces (owner_user_id, name, slug, color)
SELECT DISTINCT p.user_id, 'Main workspace', 'main', '#10b981'
FROM public.profiles p
LEFT JOIN public.workspaces w ON w.owner_user_id = p.user_id
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;

-- 3. Add workspace_id columns
ALTER TABLE public.whatsapp_numbers ADD COLUMN workspace_id uuid;
ALTER TABLE public.conversations ADD COLUMN workspace_id uuid;
ALTER TABLE public.deals ADD COLUMN workspace_id uuid;
ALTER TABLE public.pipeline_stages ADD COLUMN workspace_id uuid;
ALTER TABLE public.message_templates ADD COLUMN workspace_id uuid;
ALTER TABLE public.campaigns ADD COLUMN workspace_id uuid;
ALTER TABLE public.campaign_recipients ADD COLUMN workspace_id uuid;
ALTER TABLE public.stage_automations ADD COLUMN workspace_id uuid;

-- Backfill workspace_id from owner_user_id matching
UPDATE public.whatsapp_numbers n SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = n.user_id AND w.slug = 'main';
UPDATE public.conversations c SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = c.user_id AND w.slug = 'main';
UPDATE public.deals d SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = d.user_id AND w.slug = 'main';
UPDATE public.pipeline_stages s SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = s.user_id AND w.slug = 'main';
UPDATE public.message_templates t SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = t.user_id AND w.slug = 'main';
UPDATE public.campaigns ca SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = ca.user_id AND w.slug = 'main';
UPDATE public.campaign_recipients cr SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = cr.user_id AND w.slug = 'main';
UPDATE public.stage_automations sa SET workspace_id = w.id
  FROM public.workspaces w WHERE w.owner_user_id = sa.user_id AND w.slug = 'main';

-- Enforce NOT NULL on workspace_id where data exists (skip if user had nothing)
ALTER TABLE public.whatsapp_numbers ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.message_templates ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.campaigns ALTER COLUMN workspace_id SET NOT NULL;

-- Indexes
CREATE INDEX idx_numbers_workspace ON public.whatsapp_numbers(workspace_id);
CREATE INDEX idx_conv_workspace ON public.conversations(workspace_id);
CREATE INDEX idx_deals_workspace ON public.deals(workspace_id);
CREATE INDEX idx_stages_workspace ON public.pipeline_stages(workspace_id);
CREATE INDEX idx_templates_workspace ON public.message_templates(workspace_id);
CREATE INDEX idx_campaigns_workspace ON public.campaigns(workspace_id);
CREATE INDEX idx_recipients_workspace ON public.campaign_recipients(workspace_id);

-- 4. Add new RLS policies (workspace-aware) alongside existing user_id ones
CREATE POLICY "Workspace members view numbers" ON public.whatsapp_numbers
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members view conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members view deals" ON public.deals
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members view stages" ON public.pipeline_stages
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members view templates" ON public.message_templates
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members view campaigns" ON public.campaigns
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Workspace members view recipients" ON public.campaign_recipients
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

-- 5. Campaigns: recurrence + auto-allocation flag
DO $$ BEGIN
  CREATE TYPE public.campaign_recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.campaigns
  ADD COLUMN recurrence public.campaign_recurrence NOT NULL DEFAULT 'none',
  ADD COLUMN recurrence_end_at timestamptz,
  ADD COLUMN parent_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN auto_allocated boolean NOT NULL DEFAULT true,
  ADD COLUMN per_number_quota integer NOT NULL DEFAULT 200;

-- Allow 'scheduled' status
DO $$ BEGIN
  ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'scheduled';
EXCEPTION WHEN others THEN NULL; END $$;

-- 6. Templates: category
DO $$ BEGIN
  CREATE TYPE public.template_category AS ENUM ('marketing', 'utility', 'authentication');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.message_templates
  ALTER COLUMN category DROP DEFAULT,
  ALTER COLUMN category TYPE public.template_category USING (
    CASE
      WHEN category IS NULL THEN 'marketing'::public.template_category
      WHEN lower(category) IN ('marketing','utility','authentication')
        THEN lower(category)::public.template_category
      ELSE 'marketing'::public.template_category
    END
  ),
  ALTER COLUMN category SET DEFAULT 'marketing'::public.template_category,
  ALTER COLUMN category SET NOT NULL;

-- 7. Number allocations per campaign (auto + override)
CREATE TABLE public.campaign_number_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  whatsapp_number_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  allocated_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  is_manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, whatsapp_number_id)
);

ALTER TABLE public.campaign_number_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members manage allocations" ON public.campaign_number_allocations
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX idx_alloc_campaign ON public.campaign_number_allocations(campaign_id);
CREATE INDEX idx_alloc_number ON public.campaign_number_allocations(whatsapp_number_id);

-- 8. Add whatsapp_number_id to campaign_recipients (so we know which number sent it)
ALTER TABLE public.campaign_recipients
  ADD COLUMN whatsapp_number_id uuid;

CREATE INDEX idx_recipients_number ON public.campaign_recipients(whatsapp_number_id);

-- 9. Update ensure_pipeline_stage to be workspace-aware via fallback
-- (keeps signature; we'll add overloaded workspace-version later if needed)

-- 1) Scheduling fields on campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS schedule_window_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS schedule_window_end time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS respect_recipient_tz boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scheduled_dates date[] NOT NULL DEFAULT '{}'::date[];

-- 2) Slack channel per workspace
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS slack_channel_id text;

-- 3) Roadmap items table
CREATE TYPE public.roadmap_status AS ENUM ('idea', 'planned', 'in_progress', 'shipped');

CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  why text,
  status public.roadmap_status NOT NULL DEFAULT 'idea',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  priority integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_roadmap_items_workspace ON public.roadmap_items(workspace_id, status, position);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers view roadmap"
  ON public.roadmap_items FOR SELECT TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Managers insert roadmap"
  ON public.roadmap_items FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Managers update roadmap"
  ON public.roadmap_items FOR UPDATE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE POLICY "Managers delete roadmap"
  ON public.roadmap_items FOR DELETE TO authenticated
  USING (public.is_workspace_manager(workspace_id, auth.uid()));

CREATE TRIGGER trg_roadmap_items_updated
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

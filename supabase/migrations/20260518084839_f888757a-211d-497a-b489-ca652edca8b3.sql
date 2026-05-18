-- Template-group routing for first-touch (issue 3) and follow-up scheduler (issue 4)

ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS first_touch_template_group_id uuid REFERENCES public.template_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_template_id uuid,
  ADD COLUMN IF NOT EXISTS follow_up_template_group_id uuid REFERENCES public.template_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_delay_minutes integer NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS follow_up_curfew_end time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS follow_up_resume_at time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS follow_up_timezone text NOT NULL DEFAULT 'Europe/Berlin';

-- Follow-up scheduling rows. One per first-touch send while pipeline.follow_up_enabled.
CREATE TABLE IF NOT EXISTS public.pipeline_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  whatsapp_number_id uuid NOT NULL,
  lead_import_id uuid,
  first_touch_recipient_id uuid,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  cancelled_reason text,
  campaign_recipient_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status_scheduled ON public.pipeline_follow_ups (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_conv ON public.pipeline_follow_ups (conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_follow_up_scheduled_per_conv
  ON public.pipeline_follow_ups (conversation_id)
  WHERE status = 'scheduled';

ALTER TABLE public.pipeline_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read follow-ups"
  ON public.pipeline_follow_ups
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service role manages follow-ups"
  ON public.pipeline_follow_ups
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

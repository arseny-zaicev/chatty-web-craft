
-- campaigns: dispatch mode + snapshot + kill switch + inflight caps
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS dispatch_mode text NOT NULL DEFAULT 'paced',
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS prepared_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS prepared_report jsonb,
  ADD COLUMN IF NOT EXISTS prepared_signature text,
  ADD COLUMN IF NOT EXISTS kill_switch_at timestamptz,
  ADD COLUMN IF NOT EXISTS kill_switch_by uuid,
  ADD COLUMN IF NOT EXISTS kill_switch_reason text,
  ADD COLUMN IF NOT EXISTS max_inflight_per_number int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_inflight_per_campaign int NOT NULL DEFAULT 50;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_dispatch_mode_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_dispatch_mode_check CHECK (dispatch_mode IN ('paced','marketing_instant'));

-- whatsapp_numbers: per-sender pause
ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text;

-- dispatch events
CREATE TABLE IF NOT EXISTS public.campaign_dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid,
  whatsapp_number_id uuid,
  event_type text NOT NULL,
  reason text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cde_campaign_created ON public.campaign_dispatch_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cde_number_created ON public.campaign_dispatch_events (whatsapp_number_id, created_at DESC);

ALTER TABLE public.campaign_dispatch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read dispatch events" ON public.campaign_dispatch_events;
CREATE POLICY "members read dispatch events"
ON public.campaign_dispatch_events FOR SELECT
USING (
  workspace_id IS NULL
  OR public.is_workspace_member(workspace_id, auth.uid())
);

-- provider backoff
CREATE TABLE IF NOT EXISTS public.provider_backoff (
  whatsapp_number_id uuid PRIMARY KEY REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  retry_after timestamptz NOT NULL,
  last_status int,
  last_error text,
  attempt_count int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_backoff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read provider backoff" ON public.provider_backoff;
CREATE POLICY "members read provider backoff"
ON public.provider_backoff FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_numbers n
    WHERE n.id = provider_backoff.whatsapp_number_id
      AND public.is_workspace_member(n.workspace_id, auth.uid())
  )
);

-- system flags
CREATE TABLE IF NOT EXISTS public.system_flags (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.system_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone read system flags" ON public.system_flags;
CREATE POLICY "anyone read system flags"
ON public.system_flags FOR SELECT
USING (true);

DROP POLICY IF EXISTS "admin write system flags" ON public.system_flags;
CREATE POLICY "admin write system flags"
ON public.system_flags FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.system_flags (key, value)
VALUES ('marketing_instant_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

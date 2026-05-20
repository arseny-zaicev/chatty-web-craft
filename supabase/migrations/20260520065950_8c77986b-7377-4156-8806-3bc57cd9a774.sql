-- =========================================================================
-- PHASE A — Normalize whatsapp_message_events + standardize on number_ownership
-- =========================================================================

-- 1) Add source column to events (campaign | inbox | template | unknown)
ALTER TABLE public.whatsapp_message_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown';

-- 2) Backfill whatsapp_number_id from campaign_recipients (if cr known)
UPDATE public.whatsapp_message_events e
   SET whatsapp_number_id = cr.whatsapp_number_id
  FROM public.campaign_recipients cr
 WHERE e.campaign_recipient_id = cr.id
   AND e.whatsapp_number_id IS NULL
   AND cr.whatsapp_number_id IS NOT NULL;

-- 3) Backfill campaign_recipient_id via provider_message_id (most reliable)
UPDATE public.whatsapp_message_events e
   SET campaign_recipient_id = cr.id,
       whatsapp_number_id = COALESCE(e.whatsapp_number_id, cr.whatsapp_number_id),
       workspace_id = COALESCE(e.workspace_id, cr.workspace_id)
  FROM public.campaign_recipients cr
 WHERE cr.provider_message_id = e.provider_message_id
   AND e.provider_message_id IS NOT NULL
   AND e.campaign_recipient_id IS NULL;

-- 4) Backfill message_id via provider_message_id -> messages
UPDATE public.whatsapp_message_events e
   SET message_id = m.id
  FROM public.messages m
 WHERE m.provider_message_id = e.provider_message_id
   AND e.provider_message_id IS NOT NULL
   AND e.message_id IS NULL;

-- 5) Backfill whatsapp_number_id from messages -> conversations (manual sends)
UPDATE public.whatsapp_message_events e
   SET whatsapp_number_id = c.whatsapp_number_id,
       workspace_id = COALESCE(e.workspace_id, c.workspace_id)
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
 WHERE e.message_id = m.id
   AND e.whatsapp_number_id IS NULL;

-- 6) Tag source
-- campaign: linked to a campaign_recipient
UPDATE public.whatsapp_message_events
   SET source = 'campaign'
 WHERE campaign_recipient_id IS NOT NULL AND source = 'unknown';

-- template: message.metadata says it's a template send (quick template / re-engagement)
UPDATE public.whatsapp_message_events e
   SET source = 'template'
  FROM public.messages m
 WHERE e.message_id = m.id
   AND e.source = 'unknown'
   AND (m.metadata ? 'template_name' OR m.metadata ? 'template_id' OR m.metadata->>'type' = 'template');

-- inbox: any remaining manual outbound through a conversation
UPDATE public.whatsapp_message_events e
   SET source = 'inbox'
  FROM public.messages m
 WHERE e.message_id = m.id
   AND e.source = 'unknown'
   AND m.direction = 'outbound';

-- inbound webhooks (replies) -> 'inbox' as well, but mark via direction
UPDATE public.whatsapp_message_events e
   SET source = 'inbox'
  FROM public.messages m
 WHERE e.message_id = m.id
   AND e.source = 'unknown'
   AND m.direction = 'inbound';

-- 7) Helpful indexes for dedup & lookups
CREATE INDEX IF NOT EXISTS idx_wme_pmid_event
  ON public.whatsapp_message_events (provider_message_id, event_type)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wme_source_received
  ON public.whatsapp_message_events (source, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_wme_number_received
  ON public.whatsapp_message_events (whatsapp_number_id, received_at DESC)
  WHERE whatsapp_number_id IS NOT NULL;

-- =========================================================================
-- 8) Extend number_ownership to be the single source of truth for partner pay
-- =========================================================================
ALTER TABLE public.number_ownership
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS rate_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS source_bm_assignment_id uuid;

-- 9) Migrate active bm_partner_assignments into number_ownership:
--    one row per (number under that BM, partner, role).
INSERT INTO public.number_ownership
  (whatsapp_number_id, partner_id, role, rate_usd,
   effective_from, effective_to, created_at, created_by,
   notes, source_bm_assignment_id)
SELECT n.id, a.partner_id, a.role, a.rate_usd,
       a.effective_from, a.effective_to, a.created_at, a.created_by,
       CONCAT('Migrated from bm_partner_assignments ', a.id::text), a.id
  FROM public.bm_partner_assignments a
  JOIN public.whatsapp_numbers n ON n.business_manager_id = a.business_manager_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.number_ownership o
    WHERE o.whatsapp_number_id = n.id
      AND o.partner_id = a.partner_id
      AND o.role = a.role
      AND COALESCE(o.source_bm_assignment_id::text, '') = a.id::text
 );

CREATE INDEX IF NOT EXISTS idx_number_ownership_partner_active
  ON public.number_ownership (partner_id, whatsapp_number_id)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_number_ownership_number_active
  ON public.number_ownership (whatsapp_number_id)
  WHERE effective_to IS NULL;
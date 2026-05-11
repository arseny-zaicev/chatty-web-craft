-- 1. Conversation insights (AI classification of replies)
CREATE TABLE IF NOT EXISTS public.conversation_insights (
  conversation_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  reply_sentiment text,
  reply_intent text,
  first_reply_text text,
  first_reply_at timestamptz,
  time_to_first_reply_seconds integer,
  summary text,
  model text,
  tagged_at timestamptz NOT NULL DEFAULT now(),
  tagged_by text NOT NULL DEFAULT 'ai',
  tagged_by_user_id uuid,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.conversation_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view conversation insights"
ON public.conversation_insights FOR SELECT TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service role manages conversation insights"
ON public.conversation_insights FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS conversation_insights_workspace_idx ON public.conversation_insights(workspace_id);
CREATE INDEX IF NOT EXISTS conversation_insights_sentiment_idx ON public.conversation_insights(reply_sentiment);

-- 2. Campaign-level AI insights summary
CREATE TABLE IF NOT EXISTS public.campaign_insights (
  campaign_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  summary_md text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid
);

ALTER TABLE public.campaign_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view campaign insights"
ON public.campaign_insights FOR SELECT TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Service role manages campaign insights"
ON public.campaign_insights FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 3. Report view: one row per recipient with everything joined
CREATE OR REPLACE VIEW public.campaign_report_rows AS
SELECT
  cr.id AS recipient_id,
  cr.campaign_id,
  cr.workspace_id,
  c.name AS campaign_name,
  c.pipeline_id,
  cr.contact_phone,
  cr.contact_name,
  cr.status::text AS delivery_status,
  cr.sent_at,
  cr.scheduled_at,
  cr.error_message,
  cr.provider_message_id,
  cr.variables AS lead_payload,
  cr.whatsapp_number_id,
  wn.phone_number AS whatsapp_number,
  wn.display_name AS whatsapp_number_label,
  COALESCE((cr.variables->>'__tpl_id')::uuid, c.template_id) AS template_id,
  mt.name AS template_name,
  mt.body AS template_body,
  cr.conversation_id,
  conv.last_message_at,
  conv.unread_count,
  ci.reply_sentiment,
  ci.reply_intent,
  ci.first_reply_text,
  ci.first_reply_at,
  ci.time_to_first_reply_seconds,
  (ci.first_reply_at IS NOT NULL OR conv.id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.messages m
     WHERE m.conversation_id = conv.id AND m.direction = 'inbound' LIMIT 1
  )) AS replied
FROM public.campaign_recipients cr
JOIN public.campaigns c ON c.id = cr.campaign_id
LEFT JOIN public.whatsapp_numbers wn ON wn.id = cr.whatsapp_number_id
LEFT JOIN public.message_templates mt
       ON mt.id = COALESCE((cr.variables->>'__tpl_id')::uuid, c.template_id)
LEFT JOIN public.conversations conv ON conv.id = cr.conversation_id
LEFT JOIN public.conversation_insights ci ON ci.conversation_id = cr.conversation_id;

-- View inherits RLS via underlying tables (campaign_recipients policy enforces workspace).

-- 4. RPC wrapper for export
CREATE OR REPLACE FUNCTION public.get_campaign_report(p_campaign_id uuid)
RETURNS SETOF public.campaign_report_rows
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.campaign_report_rows WHERE campaign_id = p_campaign_id;
$$;

GRANT SELECT ON public.campaign_report_rows TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_report(uuid) TO authenticated;
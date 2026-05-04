CREATE TYPE public.campaign_status AS ENUM ('draft', 'running', 'paused', 'completed', 'failed');
CREATE TYPE public.campaign_recipient_status AS ENUM ('pending', 'scheduled', 'sending', 'sent', 'failed');

ALTER TABLE public.deals
  ADD CONSTRAINT deals_conversation_unique UNIQUE (conversation_id);

CREATE INDEX IF NOT EXISTS idx_deals_user_conversation ON public.deals(user_id, conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_user_number ON public.conversations(user_id, whatsapp_number_id);

CREATE OR REPLACE FUNCTION public.ensure_pipeline_stage(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stage_id uuid;
BEGIN
  SELECT id INTO _stage_id
  FROM public.pipeline_stages
  WHERE user_id = _user_id
  ORDER BY position ASC, created_at ASC
  LIMIT 1;

  IF _stage_id IS NULL THEN
    INSERT INTO public.pipeline_stages (user_id, name, color, position, stage_type)
    VALUES (_user_id, 'New chats', '#10b981', 0, 'open')
    RETURNING id INTO _stage_id;
  END IF;

  RETURN _stage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_deal_for_conversation(_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv public.conversations%ROWTYPE;
  _stage_id uuid;
  _deal_id uuid;
  _position integer;
BEGIN
  SELECT * INTO _conv FROM public.conversations WHERE id = _conversation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id INTO _deal_id FROM public.deals WHERE conversation_id = _conversation_id LIMIT 1;
  IF _deal_id IS NOT NULL THEN
    RETURN _deal_id;
  END IF;

  _stage_id := public.ensure_pipeline_stage(_conv.user_id);

  SELECT COALESCE(MAX(position), -1) + 1 INTO _position
  FROM public.deals
  WHERE user_id = _conv.user_id AND stage_id = _stage_id;

  INSERT INTO public.deals (
    user_id,
    conversation_id,
    stage_id,
    title,
    contact_name,
    contact_phone,
    position
  ) VALUES (
    _conv.user_id,
    _conv.id,
    _stage_id,
    COALESCE(NULLIF(_conv.contact_name, ''), '+' || _conv.contact_phone),
    _conv.contact_name,
    _conv.contact_phone,
    _position
  )
  ON CONFLICT (conversation_id) DO UPDATE SET
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    updated_at = now()
  RETURNING id INTO _deal_id;

  RETURN _deal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_deal_for_new_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_deal_for_conversation(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_deal_for_new_conversation ON public.conversations;
CREATE TRIGGER trg_create_deal_for_new_conversation
AFTER INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.create_deal_for_new_conversation();

CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  category text,
  status text NOT NULL DEFAULT 'approved',
  body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, language)
);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  whatsapp_number_id uuid NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  delay_min_seconds integer NOT NULL DEFAULT 30,
  delay_max_seconds integer NOT NULL DEFAULT 90,
  scheduled_start_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_phone text NOT NULL,
  contact_name text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.campaign_recipient_status NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_message_templates_user ON public.message_templates(user_id, status);
CREATE INDEX idx_campaigns_user_status ON public.campaigns(user_id, status, created_at DESC);
CREATE INDEX idx_campaign_recipients_queue ON public.campaign_recipients(status, scheduled_at) WHERE status IN ('scheduled', 'sending');
CREATE INDEX idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id, status);
CREATE INDEX idx_campaign_recipients_phone ON public.campaign_recipients(user_id, contact_phone);

CREATE POLICY "Users view own templates" ON public.message_templates
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Users insert own templates" ON public.message_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own templates" ON public.message_templates
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Users delete own templates" ON public.message_templates
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users view own campaigns" ON public.campaigns
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Users insert own campaigns" ON public.campaigns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own campaigns" ON public.campaigns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Users delete own campaigns" ON public.campaigns
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users view own campaign recipients" ON public.campaign_recipients
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Users insert own campaign recipients" ON public.campaign_recipients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own campaign recipients" ON public.campaign_recipients
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Users delete own campaign recipients" ON public.campaign_recipients
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_message_templates_updated BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_campaign_recipients_updated BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_recipients REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- Add German (DE) tokens to positive / negative / auto-reply detectors so
-- the should_notify_lead_reply gate fires for German workspaces.
-- Without this, replies like "Ja gerne!" never produce a lead.first_reply
-- Slack event because the heuristic only knew English and Russian.

CREATE OR REPLACE FUNCTION public._is_positive_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT _text IS NOT NULL AND (
    btrim(_text) ~ '\?'
    OR lower(btrim(_text)) ~ '(^|[^a-zа-яäöüß])(yes|sure|ok|okay|sounds\s*good|interested|i[''\s]*m\s*interested|tell\s*me\s*more|send\s*(me\s*)?(more\s*)?(info|details)|share\s*details|more\s*info|learn\s*more|how\s*much|what[''\s]*s\s*the\s*price|price|pricing|cost|quote|available|availability|when|where|how|demo|call|book|schedule|meeting|интересно|давай|расскаж|подробнее|сколько|когда|где|ja|jawohl|jap|jepp|jo|klar|gerne|sehr\s*gerne|gern|passt|interessiert|interesse|natürlich|naturlich|sicher|gut|alles\s*klar|in\s*ordnung|geht\s*klar|machen\s*wir|machen|hört\s*sich\s*gut\s*an|klingt\s*gut|infos?|informationen?|details?|mehr\s*info|preis|preise|kosten|angebot|termin|anruf|gespräch|gesprach|bitte\s*senden|schick(en|t|e)?|bitte\s*mehr|wann|wo|wie\s*viel|wieviel)([^a-zа-яäöüß]|$)'
  );
$function$;

CREATE OR REPLACE FUNCTION public._is_negative_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT _text IS NOT NULL AND (
    lower(btrim(_text)) ~ '(^|[^a-zа-яäöüß])(block|stop|unsubscribe|spam|not\s*relevant|not\s*for\s*me|not\s*interested|no\s*thanks?|no\s*thank\s*you|do\s*not\s*contact|remove\s*me|wrong\s*(person|number)|fuck\s*off|leave\s*me|спам|стоп|отпиш|не\s*интересно|не\s*актуально|не\s*для\s*меня|заблок|αποκλεισμός|δεν\s*είναι\s*για\s*εμάς|nein|nein\s*danke|kein\s*interesse|nicht\s*interessiert|kein\s*bedarf|kein\s*interesse\s*danke|nicht\s*relevant|falsche\s*nummer|falsche\s*person|bitte\s*entfernen|entfernen\s*sie\s*mich|abmelden|austragen|löschen|loeschen|hört\s*auf|hor\s*auf|aufhören|aufhoren|belästig|belastig|spam|verpiss|verschwinde|lass\s*mich\s*in\s*ruhe)([^a-zа-яäöüß]|$)'
  );
$function$;

CREATE OR REPLACE FUNCTION public._is_auto_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT _text IS NOT NULL AND (
    lower(btrim(_text)) ~ '(thank\s*you\s*for\s*contacting|thanks\s*for\s*contacting|gracias\s*por\s*comunicarte|we[''\s]*re\s*unavailable|currently\s*away|out\s*of\s*office|auto[-\s]*reply|our\s*office\s*(working|hours)|please\s*let\s*us\s*know\s*how\s*we\s*can\s*(help|assist)|we\s*will\s*respond\s*as\s*soon|απουσ|λειτουργ.{0,12}απ[όο]|automatische\s*antwort|abwesenheitsnotiz|abwesend|im\s*urlaub|nicht\s*im\s*büro|nicht\s*im\s*buro|außer\s*haus|ausser\s*haus|melde\s*mich.{0,15}zurück|melde\s*mich.{0,15}zuruck|wir\s*melden\s*uns|öffnungszeiten|offnungszeiten|unsere\s*geschäftszeiten|unsere\s*geschaftszeiten)'
  );
$function$;

-- Backfill missed lead.first_reply for German workspace conversations replied
-- in the last 6 hours where the gate now returns true. This recovers today's
-- "Ja gerne!" replies that were silently dropped.
INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
SELECT
  'lead.first_reply',
  cr.workspace_id,
  jsonb_build_object(
    'campaign_recipient_id', cr.id,
    'campaign_id',           cr.campaign_id,
    'pipeline_id',           c.pipeline_id,
    'conversation_id',       cr.conversation_id,
    'contact_phone',         cr.contact_phone,
    'contact_name',          COALESCE(cr.contact_name, c.contact_name),
    'last_message_text',     c.last_message_text,
    'slack_channel_id',      p.slack_channel_id,
    'whatsapp_number_id',    cr.whatsapp_number_id,
    'source',                'de_tokens_backfill'
  )
FROM public.campaign_recipients cr
JOIN public.conversations c ON c.id = cr.conversation_id
LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
WHERE cr.status = 'replied'
  AND cr.updated_at > now() - interval '6 hours'
  AND cr.conversation_id IS NOT NULL
  AND public.should_notify_lead_reply(cr.conversation_id, c.last_message_text)
  AND NOT EXISTS (
    SELECT 1 FROM public.slack_event_queue q
    WHERE q.event_type IN ('lead.first_reply','positive_lead')
      AND q.payload->>'conversation_id' = cr.conversation_id::text
  );
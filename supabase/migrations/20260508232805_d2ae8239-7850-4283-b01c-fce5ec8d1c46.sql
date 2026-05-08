-- 1. Remove templates with no number binding (cannot belong to a sender)
DELETE FROM public.message_templates WHERE whatsapp_number_id IS NULL;

-- 2. Require number binding going forward
ALTER TABLE public.message_templates
  ALTER COLUMN whatsapp_number_id SET NOT NULL;

-- 3. Swap uniqueness: was (user_id, name, language); now (whatsapp_number_id, name, language)
ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_user_id_name_language_key;

ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_number_name_language_key
  UNIQUE (whatsapp_number_id, name, language);

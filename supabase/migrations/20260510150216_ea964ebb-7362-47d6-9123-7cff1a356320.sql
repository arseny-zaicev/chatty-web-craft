DROP TRIGGER IF EXISTS trg_conversations_positive_lead ON public.conversations;
DROP FUNCTION IF EXISTS public.enqueue_positive_lead_event();
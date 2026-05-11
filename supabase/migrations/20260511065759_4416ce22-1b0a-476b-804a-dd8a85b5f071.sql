CREATE OR REPLACE FUNCTION public.reset_unread_on_manager_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'outbound' AND NEW.sent_by_user_id IS NOT NULL THEN
    UPDATE public.conversations
       SET unread_count = 0
     WHERE id = NEW.conversation_id
       AND unread_count > 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reset_unread_on_manager_reply ON public.messages;
CREATE TRIGGER reset_unread_on_manager_reply
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.reset_unread_on_manager_reply();
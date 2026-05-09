-- Pipeline ↔ Inbox sync + assignee tracking

-- 1. Conversations: add assignee + presence tracking
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS active_responder_id uuid,
  ADD COLUMN IF NOT EXISTS active_responder_at timestamptz;

CREATE INDEX IF NOT EXISTS conversations_assigned_user_id_idx
  ON public.conversations (assigned_user_id);

-- 2. Allow workspace members to update conversations (assignee, presence, pin, star, etc.)
DROP POLICY IF EXISTS "Workspace members update conversations" ON public.conversations;
CREATE POLICY "Workspace members update conversations"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 3. Backfill: ensure every conversation has a deal (uses existing function)
DO $$
DECLARE c_id uuid;
BEGIN
  FOR c_id IN
    SELECT c.id FROM public.conversations c
    LEFT JOIN public.deals d ON d.conversation_id = c.id
    WHERE d.id IS NULL
  LOOP
    PERFORM public.ensure_deal_for_conversation(c_id);
  END LOOP;
END$$;

-- 4. Realtime: ensure conversations is in the publication (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
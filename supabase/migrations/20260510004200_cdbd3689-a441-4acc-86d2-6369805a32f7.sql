-- 1) Allow workspace members to read/insert/update messages within their workspace
CREATE POLICY "Workspace members view messages"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND is_workspace_member(c.workspace_id, auth.uid())
  )
);

CREATE POLICY "Workspace members insert messages"
ON public.messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND is_workspace_member(c.workspace_id, auth.uid())
  )
);

CREATE POLICY "Workspace members update messages"
ON public.messages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND is_workspace_member(c.workspace_id, auth.uid())
  )
);

-- 2) Reorder pipeline stages for every existing workspace:
--    add "Message sent" at the top, move "Not interested/Block" right before "Booked"
DO $$
DECLARE
  ws RECORD;
  uid uuid;
  new_pos int;
  rec RECORD;
  not_interested_id uuid;
  booked_pos int;
BEGIN
  FOR ws IN SELECT DISTINCT workspace_id, user_id FROM public.pipeline_stages WHERE workspace_id IS NOT NULL LOOP
    -- Insert "Message sent" if not present
    IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE workspace_id = ws.workspace_id AND name = 'Message sent') THEN
      INSERT INTO public.pipeline_stages (workspace_id, user_id, name, color, stage_type, position)
      VALUES (ws.workspace_id, ws.user_id, 'Message sent', '#64748b', 'open', -1);
    END IF;

    -- Find Not interested/Block id
    SELECT id INTO not_interested_id FROM public.pipeline_stages
      WHERE workspace_id = ws.workspace_id AND name = 'Not interested/Block' LIMIT 1;

    -- Find Booked position
    SELECT position INTO booked_pos FROM public.pipeline_stages
      WHERE workspace_id = ws.workspace_id AND name = 'Booked' LIMIT 1;

    -- Reassign sequential positions: Message sent first, then others in original order,
    -- but place Not interested/Block right before Booked
    new_pos := 0;
    FOR rec IN
      SELECT id, name, position FROM public.pipeline_stages
      WHERE workspace_id = ws.workspace_id
      ORDER BY
        CASE WHEN name = 'Message sent' THEN 0 ELSE 1 END,
        position
    LOOP
      -- Skip Not interested here (we'll place it before Booked)
      IF rec.name = 'Not interested/Block' THEN
        CONTINUE;
      END IF;

      -- If we're about to place Booked and Not interested exists, place it first
      IF rec.name = 'Booked' AND not_interested_id IS NOT NULL THEN
        UPDATE public.pipeline_stages SET position = new_pos WHERE id = not_interested_id;
        new_pos := new_pos + 1;
      END IF;

      UPDATE public.pipeline_stages SET position = new_pos WHERE id = rec.id;
      new_pos := new_pos + 1;
    END LOOP;

    -- Edge case: if Booked doesn't exist but Not interested does, put it at the end
    IF not_interested_id IS NOT NULL AND booked_pos IS NULL THEN
      UPDATE public.pipeline_stages SET position = new_pos WHERE id = not_interested_id;
    END IF;
  END LOOP;
END $$;

-- 1. Extend trigger enum
ALTER TYPE automation_trigger ADD VALUE IF NOT EXISTS 'time_no_inbound';
ALTER TYPE automation_trigger ADD VALUE IF NOT EXISTS 'time_in_stage';
ALTER TYPE automation_trigger ADD VALUE IF NOT EXISTS 'conversation_assigned';
ALTER TYPE automation_trigger ADD VALUE IF NOT EXISTS 'conversation_claimed_self';

-- 2. New optional columns
ALTER TABLE public.stage_automations
  ADD COLUMN IF NOT EXISTS delay_minutes integer,
  ADD COLUMN IF NOT EXISTS source_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_stage_automations_source_stage
  ON public.stage_automations(source_stage_id) WHERE source_stage_id IS NOT NULL;

-- 3. Helper to apply assignment automations.
-- Called from AFTER UPDATE trigger on conversations.
CREATE OR REPLACE FUNCTION public.apply_assignment_automations(
  _conversation_id uuid,
  _new_assignee uuid,
  _prev_assignee uuid,
  _actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deal record;
  _stage_pipeline uuid;
  _rule record;
  _target_stage record;
  _resolved_target uuid;
BEGIN
  IF _conversation_id IS NULL OR _new_assignee IS NULL THEN RETURN; END IF;
  IF _new_assignee IS NOT DISTINCT FROM _prev_assignee THEN RETURN; END IF;

  -- Find the conversation's deal + current stage + pipeline.
  SELECT d.id AS deal_id, d.stage_id, d.pipeline_id
    INTO _deal
    FROM public.deals d
   WHERE d.conversation_id = _conversation_id
   ORDER BY d.updated_at DESC
   LIMIT 1;

  IF _deal.deal_id IS NULL OR _deal.pipeline_id IS NULL THEN RETURN; END IF;

  -- Don't move from terminal stages.
  PERFORM 1 FROM public.pipeline_stages
    WHERE id = _deal.stage_id AND stage_type IN ('won','lost','closed');
  IF FOUND THEN RETURN; END IF;

  -- Iterate matching active rules.
  FOR _rule IN
    SELECT id, trigger::text AS trig, target_stage_id, source_stage_id
      FROM public.stage_automations
     WHERE pipeline_id = _deal.pipeline_id
       AND is_active = true
       AND trigger::text IN ('conversation_assigned','conversation_claimed_self')
       AND (source_stage_id IS NULL OR source_stage_id = _deal.stage_id)
  LOOP
    -- claimed_self: actor must equal new assignee.
    IF _rule.trig = 'conversation_claimed_self'
       AND (_actor IS NULL OR _actor IS DISTINCT FROM _new_assignee) THEN
      CONTINUE;
    END IF;

    -- Resolve target stage (must belong to same pipeline; otherwise try name fallback).
    SELECT id, name, pipeline_id, stage_type
      INTO _target_stage
      FROM public.pipeline_stages
     WHERE id = _rule.target_stage_id;

    IF _target_stage.id IS NULL THEN CONTINUE; END IF;

    IF _target_stage.pipeline_id = _deal.pipeline_id THEN
      _resolved_target := _target_stage.id;
    ELSE
      SELECT id INTO _resolved_target
        FROM public.pipeline_stages
       WHERE pipeline_id = _deal.pipeline_id
         AND lower(name) = lower(coalesce(_target_stage.name,''))
       LIMIT 1;
      IF _resolved_target IS NULL THEN CONTINUE; END IF;
    END IF;

    UPDATE public.deals
       SET stage_id = _resolved_target,
           pipeline_id = _deal.pipeline_id,
           updated_at = now()
     WHERE id = _deal.deal_id
       AND stage_id IS DISTINCT FROM _resolved_target;

    -- Stop after first matching rule moved the card.
    EXIT;
  END LOOP;
END
$$;

-- 4. AFTER UPDATE trigger on conversations -> apply_assignment_automations.
CREATE OR REPLACE FUNCTION public.trg_conversations_assignment_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id
     AND NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.apply_assignment_automations(
      NEW.id, NEW.assigned_user_id, OLD.assigned_user_id, auth.uid()
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_conversations_assignment_automations ON public.conversations;
CREATE TRIGGER trg_conversations_assignment_automations
  AFTER UPDATE OF assigned_user_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.trg_conversations_assignment_automations();

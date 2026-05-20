
-- Add explicit setter mapping per pipeline stage
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS assigned_setter_id uuid
    REFERENCES public.workspace_setters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pipeline_stages_assigned_setter_idx
  ON public.pipeline_stages(assigned_setter_id)
  WHERE assigned_setter_id IS NOT NULL;

-- Workspace-consistency guard
CREATE OR REPLACE FUNCTION public.pipeline_stages_check_setter_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setter_ws uuid;
BEGIN
  IF NEW.assigned_setter_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO setter_ws FROM public.workspace_setters WHERE id = NEW.assigned_setter_id;
  IF setter_ws IS NULL OR setter_ws <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Setter % does not belong to workspace %', NEW.assigned_setter_id, NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipeline_stages_check_setter_workspace_trg ON public.pipeline_stages;
CREATE TRIGGER pipeline_stages_check_setter_workspace_trg
BEFORE INSERT OR UPDATE OF assigned_setter_id, workspace_id ON public.pipeline_stages
FOR EACH ROW EXECUTE FUNCTION public.pipeline_stages_check_setter_workspace();

-- Auto-move deal to the stage mapped to the assigned setter
CREATE OR REPLACE FUNCTION public.conversations_route_to_setter_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_stage uuid;
BEGIN
  IF NEW.assigned_setter_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_setter_id IS NOT DISTINCT FROM OLD.assigned_setter_id
     AND NEW.pipeline_id IS NOT DISTINCT FROM OLD.pipeline_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO target_stage
  FROM public.pipeline_stages
  WHERE pipeline_id = NEW.pipeline_id
    AND assigned_setter_id = NEW.assigned_setter_id
  LIMIT 1;

  IF target_stage IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.deals
     SET stage_id = target_stage, updated_at = now()
   WHERE conversation_id = NEW.id
     AND stage_id <> target_stage;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_route_to_setter_stage_trg ON public.conversations;
CREATE TRIGGER conversations_route_to_setter_stage_trg
AFTER INSERT OR UPDATE OF assigned_setter_id, pipeline_id ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.conversations_route_to_setter_stage();

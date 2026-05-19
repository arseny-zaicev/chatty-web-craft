ALTER TABLE public.stage_automations
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE;

UPDATE public.stage_automations sa
SET pipeline_id = ps.pipeline_id
FROM public.pipeline_stages ps
WHERE ps.id = sa.target_stage_id
  AND sa.pipeline_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stage_automations_pipeline_active
  ON public.stage_automations(pipeline_id, is_active);

CREATE OR REPLACE FUNCTION public.stage_automation_target_matches_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_pipeline uuid;
BEGIN
  SELECT pipeline_id INTO v_stage_pipeline
  FROM public.pipeline_stages
  WHERE id = NEW.target_stage_id;

  IF v_stage_pipeline IS NULL THEN
    RAISE EXCEPTION 'Target stage not found';
  END IF;

  IF NEW.pipeline_id IS NULL THEN
    NEW.pipeline_id := v_stage_pipeline;
  ELSIF NEW.pipeline_id IS DISTINCT FROM v_stage_pipeline THEN
    RAISE EXCEPTION 'Automation target stage must belong to the same pipeline';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_automation_target_matches_pipeline ON public.stage_automations;
CREATE TRIGGER trg_stage_automation_target_matches_pipeline
BEFORE INSERT OR UPDATE OF pipeline_id, target_stage_id ON public.stage_automations
FOR EACH ROW
EXECUTE FUNCTION public.stage_automation_target_matches_pipeline();
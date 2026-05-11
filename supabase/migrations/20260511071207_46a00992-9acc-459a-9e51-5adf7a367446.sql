
-- Prevent the same WhatsApp number from being a sender on two pipelines
-- where auto-outreach is currently enabled. Belt-and-suspenders for rollout safety.
CREATE OR REPLACE FUNCTION public.assert_sender_numbers_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _conflict_pipeline uuid;
  _conflict_name text;
BEGIN
  -- Only enforce when this pipeline is (becoming) auto-enabled and has senders
  IF NOT NEW.auto_outreach_enabled THEN
    RETURN NEW;
  END IF;
  IF NEW.default_sender_number_ids IS NULL OR array_length(NEW.default_sender_number_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH _id IN ARRAY NEW.default_sender_number_ids LOOP
    SELECT p.id, p.name
      INTO _conflict_pipeline, _conflict_name
    FROM public.pipelines p
    WHERE p.id <> NEW.id
      AND p.auto_outreach_enabled = true
      AND _id = ANY(p.default_sender_number_ids)
    LIMIT 1;

    IF _conflict_pipeline IS NOT NULL THEN
      RAISE EXCEPTION 'Sender number % is already in use by active pipeline % (%)', _id, _conflict_name, _conflict_pipeline
        USING ERRCODE = 'unique_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipelines_assert_sender_unique ON public.pipelines;
CREATE TRIGGER pipelines_assert_sender_unique
BEFORE INSERT OR UPDATE OF auto_outreach_enabled, default_sender_number_ids
ON public.pipelines
FOR EACH ROW EXECUTE FUNCTION public.assert_sender_numbers_unique();

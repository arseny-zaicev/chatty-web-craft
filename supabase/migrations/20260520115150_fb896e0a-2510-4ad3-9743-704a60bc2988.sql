-- 1) Release stuck-reserved rows for Resonate Group B batch (orphaned by failed launch)
update public.audience_rows
   set usage_status = 'unused', reserved_at = null
 where batch_id = '7a198208-be39-4107-9eca-17044538b6a6'
   and usage_status = 'reserved';

-- 2) Make reserve_audience_rows self-healing: also pick up rows stuck in
--    'reserved' for more than 15 minutes (orphaned by a failed launch that
--    never marked them used or released them). Prevents a single failed
--    attempt from permanently bricking a batch.
CREATE OR REPLACE FUNCTION public.reserve_audience_rows(_batch_id uuid, _quantity integer)
RETURNS SETOF public.audience_rows
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws uuid;
BEGIN
  SELECT workspace_id INTO _ws FROM public.audience_batches WHERE id = _batch_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF NOT public.is_workspace_manager(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN _quantity := 2147483647; END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.audience_rows
    WHERE batch_id = _batch_id
      AND validation_status = 'valid'
      AND (
        usage_status = 'unused'
        OR (usage_status = 'reserved' AND (reserved_at IS NULL OR reserved_at < now() - interval '15 minutes'))
      )
    ORDER BY created_at
    LIMIT _quantity
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.audience_rows r
  SET usage_status = 'reserved', reserved_at = now()
  FROM picked
  WHERE r.id = picked.id
  RETURNING r.*;
END
$$;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.audience_row_validation AS ENUM ('valid','invalid','duplicate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audience_row_usage AS ENUM ('unused','reserved','scheduled','used');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Batches
CREATE TABLE IF NOT EXISTS public.audience_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  country text,
  campaign_type text NOT NULL DEFAULT 'marketing',
  copy_profile text,
  notes text,
  variable_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audience_batches_ws ON public.audience_batches(workspace_id, created_at DESC);

ALTER TABLE public.audience_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view batches" ON public.audience_batches;
CREATE POLICY "Managers view batches" ON public.audience_batches FOR SELECT TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Managers insert batches" ON public.audience_batches;
CREATE POLICY "Managers insert batches" ON public.audience_batches FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Managers update batches" ON public.audience_batches;
CREATE POLICY "Managers update batches" ON public.audience_batches FOR UPDATE TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Managers delete batches" ON public.audience_batches;
CREATE POLICY "Managers delete batches" ON public.audience_batches FOR DELETE TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

DROP TRIGGER IF EXISTS audience_batches_updated_at ON public.audience_batches;
CREATE TRIGGER audience_batches_updated_at BEFORE UPDATE ON public.audience_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rows
CREATE TABLE IF NOT EXISTS public.audience_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.audience_batches(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  phone text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status public.audience_row_validation NOT NULL DEFAULT 'valid',
  usage_status public.audience_row_usage NOT NULL DEFAULT 'unused',
  used_in_campaign_id uuid,
  reserved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audience_rows_batch ON public.audience_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_audience_rows_ws ON public.audience_rows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audience_rows_unused ON public.audience_rows(batch_id, usage_status) WHERE usage_status = 'unused';
CREATE UNIQUE INDEX IF NOT EXISTS uq_audience_rows_batch_phone ON public.audience_rows(batch_id, phone);

ALTER TABLE public.audience_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers view rows" ON public.audience_rows;
CREATE POLICY "Managers view rows" ON public.audience_rows FOR SELECT TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Managers insert rows" ON public.audience_rows;
CREATE POLICY "Managers insert rows" ON public.audience_rows FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_manager(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Managers update rows" ON public.audience_rows;
CREATE POLICY "Managers update rows" ON public.audience_rows FOR UPDATE TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Managers delete rows" ON public.audience_rows;
CREATE POLICY "Managers delete rows" ON public.audience_rows FOR DELETE TO authenticated
USING (public.is_workspace_manager(workspace_id, auth.uid()));

-- Stats view (aggregates per batch)
DROP VIEW IF EXISTS public.audience_batch_stats;
CREATE VIEW public.audience_batch_stats
WITH (security_invoker=on) AS
SELECT
  b.id AS batch_id,
  b.workspace_id,
  COUNT(r.id)::int AS total,
  COUNT(*) FILTER (WHERE r.validation_status = 'valid')::int AS valid,
  COUNT(*) FILTER (WHERE r.validation_status = 'invalid')::int AS invalid,
  COUNT(*) FILTER (WHERE r.validation_status = 'duplicate')::int AS duplicates,
  COUNT(*) FILTER (WHERE r.usage_status = 'unused' AND r.validation_status = 'valid')::int AS unused,
  COUNT(*) FILTER (WHERE r.usage_status = 'reserved')::int AS reserved,
  COUNT(*) FILTER (WHERE r.usage_status = 'scheduled')::int AS scheduled,
  COUNT(*) FILTER (WHERE r.usage_status = 'used')::int AS used
FROM public.audience_batches b
LEFT JOIN public.audience_rows r ON r.batch_id = b.id
GROUP BY b.id, b.workspace_id;

-- Reserve rows (atomic, skip-locked) — returns the reserved rows
CREATE OR REPLACE FUNCTION public.reserve_audience_rows(_batch_id uuid, _quantity int)
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
      AND usage_status = 'unused'
    ORDER BY created_at
    LIMIT _quantity
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.audience_rows r
  SET usage_status = 'reserved', reserved_at = now()
  FROM picked
  WHERE r.id = picked.id
  RETURNING r.*;
END $$;

-- Mark reserved rows as used (link to campaign)
CREATE OR REPLACE FUNCTION public.mark_audience_rows_used(_row_ids uuid[], _campaign_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _updated int; _ws uuid;
BEGIN
  IF _row_ids IS NULL OR array_length(_row_ids,1) IS NULL THEN RETURN 0; END IF;
  SELECT workspace_id INTO _ws FROM public.audience_rows WHERE id = _row_ids[1];
  IF _ws IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_workspace_manager(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.audience_rows
  SET usage_status = 'used',
      used_in_campaign_id = _campaign_id,
      used_at = now()
  WHERE id = ANY(_row_ids);
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END $$;

-- Release reserved rows back to unused
CREATE OR REPLACE FUNCTION public.release_audience_rows(_row_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _updated int; _ws uuid;
BEGIN
  IF _row_ids IS NULL OR array_length(_row_ids,1) IS NULL THEN RETURN 0; END IF;
  SELECT workspace_id INTO _ws FROM public.audience_rows WHERE id = _row_ids[1];
  IF _ws IS NULL THEN RETURN 0; END IF;
  IF NOT public.is_workspace_manager(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE public.audience_rows
  SET usage_status = 'unused', reserved_at = NULL
  WHERE id = ANY(_row_ids) AND usage_status = 'reserved';
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END $$;

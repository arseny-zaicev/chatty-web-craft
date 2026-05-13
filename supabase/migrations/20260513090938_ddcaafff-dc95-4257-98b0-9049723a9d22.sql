
-- Per-number daily send cap (Meta tier ceiling). Default 200 = current Tier 1.
ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS daily_send_limit integer NOT NULL DEFAULT 200;

ALTER TABLE public.whatsapp_numbers
  ADD CONSTRAINT whatsapp_numbers_daily_send_limit_chk
  CHECK (daily_send_limit BETWEEN 1 AND 100000);

-- Capacity bookkeeping on campaigns (snapshots at launch).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS allocated_capacity integer,
  ADD COLUMN IF NOT EXISTS audience_total integer;

-- Helper: how many recipients a given number has already actually sent today (Dubai TZ).
-- Used by the worker safety net to refuse to overshoot per-number cap.
CREATE OR REPLACE FUNCTION public.count_sent_today_for_number(_number_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.campaign_recipients
  WHERE whatsapp_number_id = _number_id
    AND sent_at IS NOT NULL
    AND (sent_at AT TIME ZONE 'Asia/Dubai')::date = (now() AT TIME ZONE 'Asia/Dubai')::date;
$$;

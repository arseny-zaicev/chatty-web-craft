-- Backfill: respread 313 recipients of campaign 5acc6c71 that are clamped at
-- 2026-05-14 05:00 UTC (single-second pile-up caused by the endUtc clamp bug).
-- We respread them across 2026-05-14 14:00 UTC .. 22:00 UTC (10:00-18:00 EDT,
-- which is 06:00-15:00 PDT — safe US business window across all US time zones)
-- with linear spacing + small jitter so they go out paced through the day.
WITH stuck AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY random()) - 1 AS rn,
         COUNT(*) OVER () AS total
  FROM campaign_recipients
  WHERE campaign_id = '5acc6c71-4ab5-4129-a4ae-d6e8c6e6326e'
    AND status = 'scheduled'
    AND scheduled_at = '2026-05-14 05:00:00+00'
)
UPDATE campaign_recipients cr
SET scheduled_at = TIMESTAMPTZ '2026-05-14 14:00:00+00'
                 + (s.rn::numeric / GREATEST(s.total - 1, 1)) * INTERVAL '8 hours'
                 + (random() * INTERVAL '60 seconds' - INTERVAL '30 seconds'),
    updated_at = now()
FROM stuck s
WHERE cr.id = s.id;

-- Refresh campaign roll-up timing so the wizard / Slack reflect the new plan.
UPDATE campaigns
SET first_scheduled_at = (
      SELECT MIN(scheduled_at) FROM campaign_recipients
      WHERE campaign_id = '5acc6c71-4ab5-4129-a4ae-d6e8c6e6326e'
        AND status IN ('scheduled', 'pending')
    ),
    today_recipients_count = (
      SELECT COUNT(*) FROM campaign_recipients
      WHERE campaign_id = '5acc6c71-4ab5-4129-a4ae-d6e8c6e6326e'
        AND scheduled_at >= '2026-05-14 04:00:00+00'  -- 00:00 EDT May 14
        AND scheduled_at <  '2026-05-15 04:00:00+00'
    ),
    scheduled_dates = ARRAY[DATE '2026-05-13', DATE '2026-05-14']::date[],
    updated_at = now()
WHERE id = '5acc6c71-4ab5-4129-a4ae-d6e8c6e6326e';
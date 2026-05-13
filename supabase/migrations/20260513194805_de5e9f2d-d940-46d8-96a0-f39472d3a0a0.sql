UPDATE public.slack_event_queue
SET status = 'skipped',
    processed_at = now(),
    error = 'halted: per-message backfill superseded by coalesced digest path'
WHERE status = 'pending'
  AND event_type = 'lead.first_reply'
  AND payload->>'source' IN ('backfill_missed_first_reply', 'watchdog_backfill');
UPDATE public.slack_event_queue
SET status = 'pending', attempts = 0, error = NULL, processed_at = NULL
WHERE id = 'da91c9a6-d740-4bd7-8040-3cb30f09be6a';
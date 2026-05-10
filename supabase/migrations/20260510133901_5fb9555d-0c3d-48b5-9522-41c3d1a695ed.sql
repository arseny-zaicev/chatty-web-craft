-- 1. Mark Kartik Chauhan number as ready (it has API key, webhook, approved template)
UPDATE public.whatsapp_numbers
SET status = 'ready'
WHERE id = '7d1c21ac-10fa-4fd1-9ee0-e5d925e3d9c0' AND status = 'stock';

-- 2. Add dedupe timestamp on conversations for positive reply alerts (separate from manual star)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_auto_positive_alert_at timestamptz;
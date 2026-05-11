
-- Trigger enqueue_campaign_slack_event already references 'cancelled' but enum lacks it.
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'cancelled';

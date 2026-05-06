-- Restrict Realtime channel access to authenticated users only.
-- Postgres changes already filter rows via RLS on the underlying tables
-- (conversations, messages, deals, campaigns, campaign_recipients).
-- This adds a baseline policy on realtime.messages so anon clients
-- cannot subscribe to any topic.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

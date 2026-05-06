-- Remove overly broad SELECT policy on messages that exposed all messages to any authenticated user
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON public.messages;

-- Remove the permissive realtime.messages policy. The app uses postgres_changes only,
-- which relies on the underlying table RLS for visibility. Without a realtime.messages
-- policy, broadcast/presence channels are denied by default.
DROP POLICY IF EXISTS "Authenticated users can receive realtime broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can subscribe to realtime" ON realtime.messages;
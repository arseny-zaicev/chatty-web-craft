create or replace view public.inbound_health_gauge
with (security_invoker = true) as
select
  (select count(*)::int
     from public.whatsapp_webhook_raw
    where processing_status = 'received'
      and received_at < now() - interval '2 minutes') as stuck_received,
  (select count(*)::int
     from public.whatsapp_webhook_failures
    where replay_status = 'pending') as pending_failures,
  coalesce(
    (select ceil(extract(epoch from (now() - min(created_at))) / 60)::int
       from public.whatsapp_webhook_failures
      where replay_status = 'pending'),
    0
  ) as oldest_pending_age_min,
  (select last_run_at
     from public.system_heartbeats
    where name = 'whatsapp-webhook') as last_webhook_at,
  (select last_run_at
     from public.system_heartbeats
    where name = 'inbound-recovery-sweep') as last_sweep_at;

revoke all on public.inbound_health_gauge from anon, authenticated;
grant select on public.inbound_health_gauge to authenticated;

-- View security relies on the underlying tables' RLS; both
-- whatsapp_webhook_raw and whatsapp_webhook_failures restrict reads to
-- admins, so the view inherits that gate via security_invoker=true.

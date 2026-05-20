-- P0.1: Align outbound dispatch contract.
--
-- Before: claim_due_campaign_recipients capped each sender to sender_rank<=15
-- regardless of p_limit. With one active sender and cron p_limit=30, only 15
-- rows could be picked per tick. Throughput was governed by two contradictory
-- knobs (hardcoded 15 in SQL, p_limit from processQueue).
--
-- After: sender fairness window equals the requested p_limit. SQL still owns
-- fairness + pipeline daily_cap; processQueue owns pacing, per-number /
-- per-campaign concurrency, and the per-number daily_send_limit safety net.

CREATE OR REPLACE FUNCTION public.claim_due_campaign_recipients(p_limit integer DEFAULT 30)
 RETURNS SETOF campaign_recipients
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (
    select greatest(1, least(coalesce(p_limit, 30), 500)) as eff_limit
  ),
  today_bounds as (
    select
      (date_trunc('day', timezone('Asia/Dubai', now())) at time zone 'Asia/Dubai') as today_start_utc,
      ((date_trunc('day', timezone('Asia/Dubai', now())) + interval '1 day') at time zone 'Asia/Dubai') as today_end_utc
  ),
  pipeline_sent_today as (
    select c.workspace_id, c.pipeline_id, count(*)::int as sent_today
    from public.campaign_recipients cr
    join public.campaigns c on c.id = cr.campaign_id
    cross join today_bounds tb
    where cr.sent_at is not null
      and cr.sent_at >= tb.today_start_utc
      and cr.sent_at <  tb.today_end_utc
      and c.pipeline_id is not null
    group by c.workspace_id, c.pipeline_id
  ),
  capped_pipelines as (
    select p.workspace_id, p.id as pipeline_id
    from public.pipelines p
    left join pipeline_sent_today pst
      on pst.workspace_id = p.workspace_id and pst.pipeline_id = p.id
    where p.daily_cap is not null
      and coalesce(pst.sent_today, 0) >= p.daily_cap
  ),
  candidates as (
    select cr.id,
           cr.scheduled_at,
           cr.created_at,
           row_number() over (
             partition by coalesce(cr.whatsapp_number_id::text, cr.campaign_id::text)
             order by cr.scheduled_at asc nulls first, cr.created_at asc
           ) as sender_rank
    from public.campaign_recipients cr
    join public.campaigns c on c.id = cr.campaign_id
    where cr.status = 'scheduled'
      and cr.scheduled_at <= now()
      and c.status = 'running'
      and c.kill_switch_at is null
      and not exists (
        select 1 from capped_pipelines cp
        where cp.workspace_id = c.workspace_id
          and cp.pipeline_id = c.pipeline_id
      )
  ),
  picked as (
    select c.id
    from candidates c, bounds b
    where c.sender_rank <= b.eff_limit
    order by c.sender_rank asc, c.scheduled_at asc nulls first, c.created_at asc
    limit (select eff_limit from bounds)
  )
  select cr.*
  from public.campaign_recipients cr
  join picked p on p.id = cr.id
  order by cr.scheduled_at asc nulls first, cr.created_at asc;
$function$;
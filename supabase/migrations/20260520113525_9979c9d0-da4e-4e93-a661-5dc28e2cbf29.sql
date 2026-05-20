-- Enforce pipeline-level daily_cap inside claim_due_campaign_recipients.
-- Previously daily_cap was only enforced per-number (whatsapp_numbers.daily_send_limit),
-- which meant 3 sibling campaigns on 3 numbers under one pipeline could send
-- 3 x per_number_quota per day, ignoring the pipeline's stated daily_cap
-- (e.g. Reactivation = 50/day was effectively ~600/day).
--
-- New behavior: if a campaign has pipeline_id and that pipeline has daily_cap set,
-- count rows already sent today (Dubai TZ) across ALL campaigns of that pipeline
-- in that workspace. If sent_today >= daily_cap, skip candidates from that pipeline.

CREATE OR REPLACE FUNCTION public.claim_due_campaign_recipients(p_limit integer DEFAULT 30)
 RETURNS SETOF campaign_recipients
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with today_bounds as (
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
    select p.workspace_id, p.id as pipeline_id, p.daily_cap, coalesce(pst.sent_today, 0) as sent_today
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
      -- exclude recipients whose pipeline has already hit its daily cap today
      and not exists (
        select 1 from capped_pipelines cp
        where cp.workspace_id = c.workspace_id
          and cp.pipeline_id = c.pipeline_id
      )
  ), picked as (
    select id
    from candidates
    where sender_rank <= 15
    order by sender_rank asc, scheduled_at asc nulls first, created_at asc
    limit greatest(1, least(coalesce(p_limit, 30), 500))
  )
  select cr.*
  from public.campaign_recipients cr
  join picked p on p.id = cr.id
  order by cr.scheduled_at asc nulls first, cr.created_at asc;
$function$;
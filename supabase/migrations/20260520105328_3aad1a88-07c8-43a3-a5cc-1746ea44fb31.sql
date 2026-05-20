CREATE OR REPLACE FUNCTION public.claim_due_campaign_recipients(p_limit integer DEFAULT 30)
RETURNS SETOF campaign_recipients
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with candidates as (
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
  ), picked as (
    -- Round-robin across senders: take rank 1 from every sender first,
    -- then rank 2, etc. Caps each sender at 15 rows per tick so a single
    -- sender cannot monopolise the batch, but lets throughput scale with
    -- the backlog instead of being hard-capped at 1-per-sender.
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
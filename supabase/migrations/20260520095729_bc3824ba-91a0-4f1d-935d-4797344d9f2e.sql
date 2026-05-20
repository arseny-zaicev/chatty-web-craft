create or replace function public.claim_due_campaign_recipients(p_limit integer default 30)
returns setof public.campaign_recipients
language sql
security definer
set search_path = public
as $$
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
    select id
    from candidates
    where sender_rank = 1
    order by scheduled_at asc nulls first, created_at asc
    limit greatest(1, least(coalesce(p_limit, 30), 500))
  )
  select cr.*
  from public.campaign_recipients cr
  join picked p on p.id = cr.id
  order by cr.scheduled_at asc nulls first, cr.created_at asc;
$$;

grant execute on function public.claim_due_campaign_recipients(integer) to service_role;
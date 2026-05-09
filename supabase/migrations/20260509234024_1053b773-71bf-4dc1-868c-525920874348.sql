create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day date not null,
  minutes_active int not null default 0,
  sessions int not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, day)
);

create index if not exists user_activity_user_day_idx on public.user_activity(user_id, day desc);
create index if not exists user_activity_last_seen_idx on public.user_activity(last_seen_at desc);

alter table public.user_activity enable row level security;

drop policy if exists "user_activity_self_select" on public.user_activity;
create policy "user_activity_self_select"
on public.user_activity
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_activity_self_insert" on public.user_activity;
create policy "user_activity_self_insert"
on public.user_activity
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_activity_self_update" on public.user_activity;
create policy "user_activity_self_update"
on public.user_activity
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.record_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  prev_last timestamptz;
begin
  if uid is null then
    return;
  end if;

  select last_seen_at into prev_last
    from public.user_activity
    where user_id = uid and day = today;

  if prev_last is null then
    insert into public.user_activity(user_id, day, minutes_active, sessions, last_seen_at)
    values (uid, today, 1, 1, now());
  else
    update public.user_activity
    set minutes_active = minutes_active + case when now() - prev_last >= interval '40 seconds' then 1 else 0 end,
        sessions = sessions + case when now() - prev_last > interval '30 minutes' then 1 else 0 end,
        last_seen_at = now()
    where user_id = uid and day = today;
  end if;
end;
$$;

grant execute on function public.record_heartbeat() to authenticated;
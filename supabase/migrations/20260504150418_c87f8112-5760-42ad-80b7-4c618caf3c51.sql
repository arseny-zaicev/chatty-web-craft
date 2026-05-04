create or replace function public.is_workspace_owner(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = _workspace_id
      and w.owner_user_id = _user_id
  )
$$;

create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(_user_id)
      or exists (
        select 1
        from public.workspaces w
        where w.id = _workspace_id
          and w.owner_user_id = _user_id
      )
      or exists (
        select 1
        from public.workspace_members m
        where m.workspace_id = _workspace_id
          and m.user_id = _user_id
      )
$$;

drop policy if exists "Members view workspaces" on public.workspaces;
create policy "Members view workspaces"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id, auth.uid()));

drop policy if exists "Members view their memberships" on public.workspace_members;
create policy "Members view their memberships"
on public.workspace_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
  or public.is_workspace_owner(workspace_id, auth.uid())
);

drop policy if exists "Owners manage memberships" on public.workspace_members;
create policy "Owners manage memberships"
on public.workspace_members
for all
to authenticated
using (
  public.is_admin(auth.uid())
  or public.is_workspace_owner(workspace_id, auth.uid())
)
with check (
  public.is_admin(auth.uid())
  or public.is_workspace_owner(workspace_id, auth.uid())
);
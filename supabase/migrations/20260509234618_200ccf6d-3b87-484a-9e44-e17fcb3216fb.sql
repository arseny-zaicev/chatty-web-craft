-- Notes
create table if not exists public.workspace_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  title text not null default 'Untitled',
  body text not null default '',
  position int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_notes_ws_idx on public.workspace_notes(workspace_id, position, updated_at desc);

alter table public.workspace_notes enable row level security;

drop policy if exists "Managers select notes" on public.workspace_notes;
create policy "Managers select notes" on public.workspace_notes
  for select to authenticated using (is_workspace_manager(workspace_id, auth.uid()));

drop policy if exists "Managers insert notes" on public.workspace_notes;
create policy "Managers insert notes" on public.workspace_notes
  for insert to authenticated with check (is_workspace_manager(workspace_id, auth.uid()));

drop policy if exists "Managers update notes" on public.workspace_notes;
create policy "Managers update notes" on public.workspace_notes
  for update to authenticated using (is_workspace_manager(workspace_id, auth.uid()))
  with check (is_workspace_manager(workspace_id, auth.uid()));

drop policy if exists "Managers delete notes" on public.workspace_notes;
create policy "Managers delete notes" on public.workspace_notes
  for delete to authenticated using (is_workspace_manager(workspace_id, auth.uid()));

drop trigger if exists workspace_notes_updated on public.workspace_notes;
create trigger workspace_notes_updated before update on public.workspace_notes
  for each row execute function public.update_updated_at_column();

-- Files registry
create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists workspace_files_ws_idx on public.workspace_files(workspace_id, created_at desc);

alter table public.workspace_files enable row level security;

drop policy if exists "Managers select files" on public.workspace_files;
create policy "Managers select files" on public.workspace_files
  for select to authenticated using (is_workspace_manager(workspace_id, auth.uid()));

drop policy if exists "Managers insert files" on public.workspace_files;
create policy "Managers insert files" on public.workspace_files
  for insert to authenticated with check (is_workspace_manager(workspace_id, auth.uid()));

drop policy if exists "Managers delete files" on public.workspace_files;
create policy "Managers delete files" on public.workspace_files
  for delete to authenticated using (is_workspace_manager(workspace_id, auth.uid()));

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('workspace-files', 'workspace-files', false)
on conflict (id) do nothing;

-- Storage policies: path layout = "<workspace_id>/<filename>"
drop policy if exists "Managers read workspace files" on storage.objects;
create policy "Managers read workspace files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workspace-files'
    and is_workspace_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "Managers upload workspace files" on storage.objects;
create policy "Managers upload workspace files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workspace-files'
    and is_workspace_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "Managers delete workspace files" on storage.objects;
create policy "Managers delete workspace files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'workspace-files'
    and is_workspace_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );
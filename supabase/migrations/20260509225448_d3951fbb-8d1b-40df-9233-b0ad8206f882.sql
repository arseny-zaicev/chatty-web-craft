create table public.tv_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index tv_tokens_token_idx on public.tv_tokens(token);
create index tv_tokens_expires_idx on public.tv_tokens(expires_at);

alter table public.tv_tokens enable row level security;

create policy "Admins can view tv tokens"
  on public.tv_tokens for select
  using (public.is_admin(auth.uid()));

create policy "Admins can insert tv tokens"
  on public.tv_tokens for insert
  with check (public.is_admin(auth.uid()));

create policy "Admins can update tv tokens"
  on public.tv_tokens for update
  using (public.is_admin(auth.uid()));

create policy "Admins can delete tv tokens"
  on public.tv_tokens for delete
  using (public.is_admin(auth.uid()));
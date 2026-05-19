create or replace function public.tg_conversations_sync_preview_after_msg_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _preview text;
begin
  _preview := coalesce(
    nullif(NEW.body, ''),
    '[' || coalesce(NEW.media_type, 'media') || ']'
  );

  update public.conversations c
     set last_message_text = _preview,
         last_message_at   = NEW.created_at,
         last_inbound_at   = case
                               when NEW.direction = 'inbound'
                                 then greatest(coalesce(c.last_inbound_at, NEW.created_at), NEW.created_at)
                               else c.last_inbound_at
                             end,
         updated_at        = now()
   where c.id = NEW.conversation_id
     and (c.last_message_at is null or NEW.created_at >= c.last_message_at);

  return NEW;
end;
$$;

drop trigger if exists trg_conversations_sync_preview_ins on public.messages;
create trigger trg_conversations_sync_preview_ins
after insert on public.messages
for each row
execute function public.tg_conversations_sync_preview_after_msg_insert();

create or replace function public.tg_conversations_recompute_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _conv uuid;
  _last record;
begin
  _conv := coalesce(OLD.conversation_id, NEW.conversation_id);
  if _conv is null then
    return coalesce(NEW, OLD);
  end if;

  select m.body, m.media_type, m.created_at, m.direction
    into _last
    from public.messages m
   where m.conversation_id = _conv
   order by m.created_at desc
   limit 1;

  if not found then
    update public.conversations
       set last_message_text = null,
           last_message_at   = null,
           updated_at        = now()
     where id = _conv;
  else
    update public.conversations
       set last_message_text = coalesce(nullif(_last.body, ''), '[' || coalesce(_last.media_type,'media') || ']'),
           last_message_at   = _last.created_at,
           updated_at        = now()
     where id = _conv;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_conversations_recompute_preview_del on public.messages;
create trigger trg_conversations_recompute_preview_del
after delete on public.messages
for each row
execute function public.tg_conversations_recompute_preview();

drop trigger if exists trg_conversations_recompute_preview_upd on public.messages;
create trigger trg_conversations_recompute_preview_upd
after update of body, media_type on public.messages
for each row
execute function public.tg_conversations_recompute_preview();

with latest as (
  select distinct on (m.conversation_id)
         m.conversation_id,
         m.body,
         m.media_type,
         m.created_at
    from public.messages m
   order by m.conversation_id, m.created_at desc
)
update public.conversations c
   set last_message_text = coalesce(nullif(l.body, ''), '[' || coalesce(l.media_type,'media') || ']'),
       last_message_at   = l.created_at
  from latest l
 where l.conversation_id = c.id
   and (
     coalesce(c.last_message_text, '') is distinct from coalesce(nullif(l.body, ''), '[' || coalesce(l.media_type,'media') || ']')
     or coalesce(c.last_message_at, 'epoch'::timestamptz) is distinct from l.created_at
   );

update public.conversations c
   set last_message_text = null,
       last_message_at   = null
 where not exists (select 1 from public.messages m where m.conversation_id = c.id)
   and (c.last_message_text is not null or c.last_message_at is not null);
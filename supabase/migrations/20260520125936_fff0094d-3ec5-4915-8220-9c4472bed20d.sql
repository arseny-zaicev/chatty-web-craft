create unique index if not exists messages_inbound_provider_message_id_uniq
  on public.messages (provider_message_id)
  where direction = 'inbound' and provider_message_id is not null;

drop function if exists public.persist_inbound_message(uuid,uuid,uuid,text,text,uuid,text,text,text,text,jsonb);

create or replace function public.persist_inbound_message(
  _whatsapp_number_id uuid,
  _user_id uuid,
  _workspace_id uuid,
  _contact_phone text,
  _contact_name text,
  _inferred_pipeline_id uuid,
  _body text,
  _media_url text,
  _media_type text,
  _provider_message_id text,
  _metadata jsonb
)
returns table(
  conversation_id uuid,
  message_id uuid,
  conversation_created boolean,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_msg_id uuid;
  v_created boolean := false;
  v_existing_unread int;
begin
  select id, unread_count
    into v_conv_id, v_existing_unread
  from public.conversations
  where whatsapp_number_id = _whatsapp_number_id
    and contact_phone = _contact_phone
  limit 1;

  if v_conv_id is null then
    insert into public.conversations (
      user_id, workspace_id, whatsapp_number_id, contact_phone,
      contact_name, pipeline_id, unread_count
    )
    values (
      _user_id, _workspace_id, _whatsapp_number_id, _contact_phone,
      _contact_name, _inferred_pipeline_id, 1
    )
    returning id into v_conv_id;
    v_created := true;
  else
    update public.conversations
       set contact_name  = coalesce(_contact_name, contact_name),
           unread_count  = coalesce(v_existing_unread, 0) + 1
     where id = v_conv_id;
  end if;

  begin
    insert into public.messages (
      user_id, conversation_id, direction, body, media_url, media_type,
      status, provider_message_id, metadata
    )
    values (
      _user_id, v_conv_id, 'inbound', _body, _media_url, _media_type,
      'delivered', _provider_message_id, _metadata
    )
    returning id into v_msg_id;

    conversation_id      := v_conv_id;
    message_id           := v_msg_id;
    conversation_created := v_created;
    was_duplicate        := false;
    return next;
  exception
    when unique_violation then
      select m.id, m.conversation_id
        into v_msg_id, v_conv_id
      from public.messages m
      where m.provider_message_id = _provider_message_id
        and m.direction = 'inbound'
      limit 1;

      conversation_id      := v_conv_id;
      message_id           := v_msg_id;
      conversation_created := false;
      was_duplicate        := true;
      return next;
  end;
end;
$$;

revoke all on function public.persist_inbound_message(uuid,uuid,uuid,text,text,uuid,text,text,text,text,jsonb) from public;
grant execute on function public.persist_inbound_message(uuid,uuid,uuid,text,text,uuid,text,text,text,text,jsonb) to service_role;
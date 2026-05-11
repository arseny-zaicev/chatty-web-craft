CREATE OR REPLACE FUNCTION public.enqueue_workspace_member_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _full_name text;
BEGIN
  SELECT u.email::text, p.full_name
    INTO _email, _full_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = NEW.user_id;

  INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
  VALUES (
    'member_added',
    NEW.workspace_id,
    jsonb_build_object(
      'member_id',   NEW.id,
      'user_id',     NEW.user_id,
      'role',        NEW.role,
      'email',       _email,
      'full_name',   _full_name,
      'joined_at',   NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;

-- Distinguish "invited" vs "joined" workspace_members
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS joined_at  timestamptz;

-- Backfill: existing rows are treated as already joined (they predate the split)
UPDATE public.workspace_members
   SET invited_at = COALESCE(invited_at, created_at),
       joined_at  = COALESCE(joined_at,  created_at)
 WHERE joined_at IS NULL OR invited_at IS NULL;

-- Trigger: enqueue 'member_added' only when membership becomes ACTIVE
--   - on INSERT, only if joined_at IS NOT NULL (self-signup via accept-link)
--   - on UPDATE, when joined_at transitions NULL -> NOT NULL (first sign-in)
CREATE OR REPLACE FUNCTION public.enqueue_workspace_member_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _full_name text;
  _should_fire boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _should_fire := NEW.joined_at IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    _should_fire := (OLD.joined_at IS NULL) AND (NEW.joined_at IS NOT NULL);
  END IF;

  IF NOT _should_fire THEN
    RETURN NEW;
  END IF;

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
      'member_id', NEW.id,
      'user_id',   NEW.user_id,
      'role',      NEW.role,
      'email',     _email,
      'full_name', _full_name,
      'joined_at', NEW.joined_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_member_added ON public.workspace_members;
CREATE TRIGGER trg_workspace_member_added
AFTER INSERT OR UPDATE OF joined_at ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_workspace_member_added();

-- RPC: called by the app on first authenticated mount to mark
-- the current user's invited memberships as joined (fires Slack event).
CREATE OR REPLACE FUNCTION public.mark_membership_joined()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN 0;
  END IF;

  WITH upd AS (
    UPDATE public.workspace_members
       SET joined_at = now()
     WHERE user_id = _uid
       AND joined_at IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO _count FROM upd;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_membership_joined() TO authenticated;

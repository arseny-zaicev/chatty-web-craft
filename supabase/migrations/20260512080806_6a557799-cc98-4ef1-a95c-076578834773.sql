
CREATE OR REPLACE FUNCTION public.get_fleet_reply_stats(_since timestamptz)
RETURNS TABLE(whatsapp_number_id uuid, workspace_id uuid, sent_convos integer, replied_convos integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  WITH per_conv AS (
    SELECT c.id, c.whatsapp_number_id, c.workspace_id,
      bool_or(m.direction::text = 'outbound') AS has_out,
      bool_or(m.direction::text = 'inbound')  AS has_in
    FROM public.conversations c
    JOIN public.messages m ON m.conversation_id = c.id
    WHERE m.created_at >= _since
    GROUP BY c.id, c.whatsapp_number_id, c.workspace_id
  )
  SELECT pc.whatsapp_number_id, pc.workspace_id,
    COUNT(*) FILTER (WHERE pc.has_out)::int AS sent_convos,
    COUNT(*) FILTER (WHERE pc.has_out AND pc.has_in)::int AS replied_convos
  FROM per_conv pc
  WHERE pc.whatsapp_number_id IS NOT NULL
  GROUP BY pc.whatsapp_number_id, pc.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fleet_reply_stats(timestamptz) TO authenticated;

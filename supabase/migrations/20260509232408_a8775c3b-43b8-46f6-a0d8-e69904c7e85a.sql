-- Shareable invite links: one link, multiple uses, capped, expirable
CREATE TABLE public.workspace_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'manager' CHECK (role IN ('manager','client')),
  max_uses integer NOT NULL DEFAULT 4 CHECK (max_uses BETWEEN 1 AND 50),
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_invite_links_token ON public.workspace_invite_links(token);
CREATE INDEX idx_workspace_invite_links_workspace ON public.workspace_invite_links(workspace_id);

ALTER TABLE public.workspace_invite_links ENABLE ROW LEVEL SECURITY;

-- Only admins or workspace owners can manage their workspace's links
CREATE POLICY "Owners view invite links"
ON public.workspace_invite_links FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Owners insert invite links"
ON public.workspace_invite_links FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()) OR is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Owners update invite links"
ON public.workspace_invite_links FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR is_workspace_owner(workspace_id, auth.uid()));

CREATE POLICY "Owners delete invite links"
ON public.workspace_invite_links FOR DELETE TO authenticated
USING (is_admin(auth.uid()) OR is_workspace_owner(workspace_id, auth.uid()));
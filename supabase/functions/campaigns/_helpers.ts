// Shared helpers used by index.ts and per-action sibling files in this
// function folder. Keep this small: only true cross-action utilities belong
// here. Per-action logic stays in its own file.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function readJson(res: Response) {
  return await res.json().catch(() => ({}));
}

export async function getUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, authHeader };
}

export async function canAccessUser(
  admin: any,
  requesterId: string,
  ownerId: string,
) {
  if (requesterId === ownerId) return true;
  const { data } = await admin.rpc("is_admin", { _user_id: requesterId });
  return Boolean(data);
}

// Exchange a Gupshup partner token for a per-app token. Used by both the
// templates sync flow (templates.ts) and the send-template path inside the
// launch/process pipeline (index.ts -> sendTemplate).
export async function getGupshupAppToken(
  appId: string,
  partnerToken: string,
) {
  const attempts = [
    { Authorization: partnerToken, accept: "application/json" },
    { token: partnerToken, accept: "application/json" },
  ];
  let lastPayload: any = {};
  for (const headers of attempts) {
    const res = await fetch(
      `https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/token/`,
      { headers },
    );
    const payload = await readJson(res);
    const token =
      typeof payload?.token?.token === "string"
        ? payload.token.token
        : typeof payload?.token === "string"
          ? payload.token
          : "";
    if (res.ok && token) return { token, payload };
    lastPayload = payload;
  }
  return { token: "", payload: lastPayload };
}

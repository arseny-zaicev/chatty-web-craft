import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    // Caller identity (RLS-respecting client)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const workspace_id: string | undefined = body.workspace_id;
    const email: string | undefined = body.email?.trim().toLowerCase();
    const role: string = body.role === "client" ? "client" : "manager";

    if (!workspace_id || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "workspace_id and valid email required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Authorize: caller must be admin OR workspace owner
    const { data: ws } = await admin
      .from("workspaces")
      .select("id, owner_user_id, slug, name")
      .eq("id", workspace_id)
      .single();
    if (!ws) return json({ error: "Workspace not found" }, 404);

    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: caller.id });
    const allowed = Boolean(isAdmin) || ws.owner_user_id === caller.id;
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // Find or create the user
    let invitedUserId: string | null = null;
    // Try to fetch by email via admin list (paginated; best-effort match)
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
    let invited = false;

    if (existing) {
      invitedUserId = existing.id;
    } else {
      const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://iskra.ae";
      const redirectTo = `${APP_BASE_URL.replace(/\/$/, "")}/accept-invite`;
      const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (inviteErr || !invite?.user) {
        // Fallback: create a user with a random password
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });
        if (createErr || !created?.user) {
          return json({ error: createErr?.message ?? "Could not create user" }, 500);
        }
        invitedUserId = created.user.id;
      } else {
        invitedUserId = invite.user.id;
        invited = true;
      }
    }

    if (!invitedUserId) return json({ error: "User id missing" }, 500);

    // Upsert membership
    const { error: memErr } = await admin
      .from("workspace_members")
      .upsert(
        { workspace_id, user_id: invitedUserId, role },
        { onConflict: "workspace_id,user_id" },
      );
    if (memErr) {
      // workspace_members has no unique constraint? fall back to manual
      const { data: existingMem } = await admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", invitedUserId)
        .maybeSingle();
      if (existingMem) {
        await admin.from("workspace_members").update({ role }).eq("id", existingMem.id);
      } else {
        const { error: insErr } = await admin
          .from("workspace_members")
          .insert({ workspace_id, user_id: invitedUserId, role });
        if (insErr) return json({ error: insErr.message }, 500);
      }
    }

    return json({ ok: true, user_id: invitedUserId, invited, workspace: ws.slug, role });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

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
    const action: string = body.action === "accept" ? "accept" : body.action === "resend" ? "resend" : "invite";
    const workspace_id: string | undefined = body.workspace_id;
    const email: string | undefined = body.email?.trim().toLowerCase();
    const role: string = body.role === "client" ? "client" : "manager";
    const targetEmail = email ?? "";

    if (!workspace_id) {
      return json({ error: "workspace_id required" }, 400);
    }

    if (action !== "accept" && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      return json({ error: "valid email required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    if (action === "accept") {
      const { data: membership, error: memErr } = await admin
        .from("workspace_members")
        .select("id, joined_at")
        .eq("workspace_id", workspace_id)
        .eq("user_id", caller.id)
        .maybeSingle();
      if (memErr) return json({ error: memErr.message }, 500);
      if (!membership) return json({ error: "Invite membership not found" }, 404);
      if (!membership.joined_at) {
        const { error: joinErr } = await admin
          .from("workspace_members")
          .update({ joined_at: new Date().toISOString() })
          .eq("id", membership.id);
        if (joinErr) return json({ error: joinErr.message }, 500);
      }
      return json({ ok: true, joined: true });
    }

    // Authorize: caller must be admin OR workspace owner
    const { data: ws } = await admin
      .from("workspaces")
      .select("id, owner_user_id, slug, name, logo_url")
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

    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://iskra.ae";
    const inviteUrl = new URL(`${APP_BASE_URL.replace(/\/$/, "")}/accept-invite`);
    inviteUrl.searchParams.set("ws", ws.slug ?? "");
    inviteUrl.searchParams.set("wid", ws.id);
    const redirectTo = inviteUrl.toString();

    // Helper: send a workspace invitation to an existing auth user without
    // presenting it as a password reset. The auth email hook renders this
    // magic-link event with the invite template whenever redirectTo points at
    // /accept-invite.
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const sendMagicInvite = async (reason: "existing_user" | "resend") => {
      const { error } = await anonClient.auth.signInWithOtp({
        email: targetEmail,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (error) {
        console.error("signInWithOtp invite failed", { email, reason, redirectTo, error: error.message });
        return { ok: false, error: error.message, reason };
      }
      invited = true;
      console.log("Magic-link workspace invite email requested", { email, reason, redirectTo });
      return { ok: true, reason };
    };

    // Fallback for newly-created users when inviteUserByEmail cannot be used.
    // The recovery mechanism is internal only; auth-email-hook renders it as a
    // workspace invitation for /accept-invite links.
    const sendRecoveryInvite = async (reason: "invite_fallback") => {
      const { error } = await anonClient.auth.resetPasswordForEmail(targetEmail, { redirectTo });
      if (error) {
        console.error("resetPasswordForEmail failed", { email, reason, redirectTo, error: error.message });
        return { ok: false, error: error.message, reason };
      }
      invited = true;
      console.log("Recovery-backed workspace invite email requested", { email, reason, redirectTo });
      return { ok: true, reason };
    };

    if (existing) {
      invitedUserId = existing.id;
      // Existing user (e.g. previously created via fallback or re-invite) -
      // make sure they actually receive an actionable email.
      const magicInvite = await sendMagicInvite(action === "resend" ? "resend" : "existing_user");
      if (!magicInvite.ok) return json({ error: `Invite email could not be sent: ${magicInvite.error}`, code: "email_delivery_request_failed" }, 502);
    } else {
      const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
        redirectTo,
      });
      if (inviteErr || !invite?.user) {
        console.warn("inviteUserByEmail failed, falling back to createUser", inviteErr?.message);
        // Fallback: create a user with a random password, then trigger a
        // recovery email so they can set their own password.
        const tempPassword = crypto.randomUUID() + "Aa1!";
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: targetEmail,
          password: tempPassword,
          email_confirm: true,
        });
        if (createErr || !created?.user) {
          return json({ error: createErr?.message ?? "Could not create user" }, 500);
        }
        invitedUserId = created.user.id;
        const recovery = await sendRecoveryInvite("invite_fallback");
        if (!recovery.ok) return json({ error: `Invite email could not be sent: ${recovery.error}`, code: "email_delivery_request_failed", user_id: invitedUserId }, 502);
      } else {
        invitedUserId = invite.user.id;
        invited = true;
        console.log("Auth invite email requested", { email, redirectTo });
      }
    }

    if (!invitedUserId) return json({ error: "User id missing" }, 500);

    // Upsert membership. New invites are marked invited (joined_at = null) so
    // the Slack "joined CRM" alert only fires after the user actually signs in.
    const nowIso = new Date().toISOString();
    const { data: existingMem } = await admin
      .from("workspace_members")
      .select("id, joined_at")
      .eq("workspace_id", workspace_id)
      .eq("user_id", invitedUserId)
      .maybeSingle();

    if (existingMem) {
      await admin.from("workspace_members").update({ role }).eq("id", existingMem.id);
    } else {
      const { error: insErr } = await admin
        .from("workspace_members")
        .insert({
          workspace_id,
          user_id: invitedUserId,
          role,
          invited_at: nowIso,
          joined_at: null,
        });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, user_id: invitedUserId, invited, workspace: ws.slug, role, email_requested: invited });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

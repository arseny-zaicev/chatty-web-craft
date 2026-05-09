import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Crockford-style alphabet, no ambiguous chars
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function generateToken(len = 12): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "info";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ---------- PUBLIC ACTIONS (no auth required) ----------

    if (action === "info") {
      // Return safe info about a token (workspace name, role, seats left, expiry)
      const body = await req.json().catch(() => ({}));
      const token = String(body?.token ?? "").trim().toUpperCase();
      if (!token || token.length < 6 || token.length > 64) {
        return json({ valid: false, error: "Invalid link" }, 400);
      }
      const { data: link } = await admin
        .from("workspace_invite_links")
        .select("id, workspace_id, role, max_uses, used_count, expires_at, revoked_at")
        .eq("token", token)
        .maybeSingle();
      if (!link) return json({ valid: false, error: "Link not found" }, 404);
      if (link.revoked_at) return json({ valid: false, error: "Link revoked" }, 403);
      if (new Date(link.expires_at).getTime() < Date.now())
        return json({ valid: false, error: "Link expired" }, 403);
      if (link.used_count >= link.max_uses)
        return json({ valid: false, error: "All seats are taken" }, 403);

      const { data: ws } = await admin
        .from("workspaces")
        .select("name, slug")
        .eq("id", link.workspace_id)
        .maybeSingle();

      return json({
        valid: true,
        workspace_name: ws?.name ?? "your team",
        workspace_slug: ws?.slug ?? null,
        role: link.role,
        seats_left: link.max_uses - link.used_count,
      });
    }

    if (action === "accept") {
      const body = await req.json().catch(() => ({}));
      const token = String(body?.token ?? "").trim().toUpperCase();
      const email = String(body?.email ?? "").trim().toLowerCase();
      const password = String(body?.password ?? "");
      const firstName = String(body?.first_name ?? "").trim();
      const lastName = String(body?.last_name ?? "").trim();

      if (!token || token.length < 6 || token.length > 64) return json({ error: "Invalid link" }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      if (!firstName || !lastName) return json({ error: "Enter your first and last name" }, 400);
      if (firstName.length > 60 || lastName.length > 60) return json({ error: "Name is too long" }, 400);

      // Lock-and-check the link
      const { data: link } = await admin
        .from("workspace_invite_links")
        .select("id, workspace_id, role, max_uses, used_count, expires_at, revoked_at")
        .eq("token", token)
        .maybeSingle();
      if (!link) return json({ error: "Link not found" }, 404);
      if (link.revoked_at) return json({ error: "Link revoked" }, 403);
      if (new Date(link.expires_at).getTime() < Date.now()) return json({ error: "Link expired" }, 403);
      if (link.used_count >= link.max_uses) return json({ error: "All seats are taken" }, 403);

      const fullName = `${firstName} ${lastName}`;

      // Find or create the user
      let userId: string | null = null;
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list?.users.find((u) => u.email?.toLowerCase() === email);

      if (existing) {
        userId = existing.id;
        // If they have never signed in (e.g. created by a previous invite with no password set),
        // we accept this signup as their first one and set the password they typed.
        // If they have signed in before, we do NOT overwrite their password — just attach to workspace.
        if (!existing.last_sign_in_at) {
          const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
            user_metadata: { ...(existing.user_metadata ?? {}), full_name: fullName, first_name: firstName, last_name: lastName },
          });
          if (updErr) return json({ error: updErr.message }, 500);
          await admin
            .from("profiles")
            .upsert({ user_id: existing.id, full_name: fullName }, { onConflict: "user_id" });
        }
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, first_name: firstName, last_name: lastName },
        });
        if (createErr || !created?.user) {
          return json({ error: createErr?.message ?? "Could not create account" }, 500);
        }
        userId = created.user.id;

        // Upsert profile
        await admin
          .from("profiles")
          .upsert({ user_id: userId, full_name: fullName }, { onConflict: "user_id" });
      }

      if (!userId) return json({ error: "User id missing" }, 500);

      // Attach to workspace (idempotent)
      const { data: existingMem } = await admin
        .from("workspace_members")
        .select("id, role")
        .eq("workspace_id", link.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingMem) {
        const { error: insErr } = await admin
          .from("workspace_members")
          .insert({ workspace_id: link.workspace_id, user_id: userId, role: link.role });
        if (insErr) return json({ error: insErr.message }, 500);

        // Increment used_count only when a NEW membership was added
        await admin
          .from("workspace_invite_links")
          .update({ used_count: link.used_count + 1 })
          .eq("id", link.id);
      }

      const { data: ws } = await admin
        .from("workspaces")
        .select("slug")
        .eq("id", link.workspace_id)
        .maybeSingle();

      return json({
        ok: true,
        already_existed: Boolean(existing),
        email,
        workspace_slug: ws?.slug ?? null,
      });
    }

    // ---------- ADMIN ACTIONS (auth required) ----------

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const workspace_id: string | undefined = body?.workspace_id;
    if (!workspace_id) return json({ error: "workspace_id required" }, 400);

    // Authorize: admin OR workspace owner
    const { data: ws } = await admin
      .from("workspaces")
      .select("id, owner_user_id")
      .eq("id", workspace_id)
      .maybeSingle();
    if (!ws) return json({ error: "Workspace not found" }, 404);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin && ws.owner_user_id !== caller.id) {
      return json({ error: "Forbidden" }, 403);
    }

    if (action === "members") {
      // Returns enriched member list: name, email, role, joined, last sign-in,
      // total sign-ins (auth metadata), and 30-day active minutes / sessions.
      const { data: rows, error: memErr } = await admin
        .from("workspace_members")
        .select("id, user_id, role, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: true });
      if (memErr) return json({ error: memErr.message }, 500);

      const userIds = (rows ?? []).map((r) => r.user_id);
      if (userIds.length === 0) return json({ members: [] });

      // Profiles
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const profileById = new Map<string, { full_name: string | null }>();
      for (const p of profiles ?? []) profileById.set(p.user_id, { full_name: (p as { full_name?: string }).full_name ?? null });

      // Auth users — fetch one by one (no bulk by id endpoint)
      const authById = new Map<string, { email: string | null; last_sign_in_at: string | null; created_at: string | null }>();
      await Promise.all(
        userIds.map(async (uid) => {
          const { data } = await admin.auth.admin.getUserById(uid);
          if (data?.user) {
            authById.set(uid, {
              email: data.user.email ?? null,
              last_sign_in_at: data.user.last_sign_in_at ?? null,
              created_at: data.user.created_at ?? null,
            });
          }
        })
      );

      // Activity (last 30 days)
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const { data: act } = await admin
        .from("user_activity")
        .select("user_id, minutes_active, sessions, last_seen_at, day")
        .in("user_id", userIds)
        .gte("day", since);
      const actByUser = new Map<string, { minutes: number; sessions: number; last_seen: string | null }>();
      for (const a of act ?? []) {
        const cur = actByUser.get(a.user_id) ?? { minutes: 0, sessions: 0, last_seen: null as string | null };
        cur.minutes += a.minutes_active ?? 0;
        cur.sessions += a.sessions ?? 0;
        if (!cur.last_seen || (a.last_seen_at && a.last_seen_at > cur.last_seen)) cur.last_seen = a.last_seen_at;
        actByUser.set(a.user_id, cur);
      }

      const members = (rows ?? []).map((r) => {
        const auth = authById.get(r.user_id) ?? { email: null, last_sign_in_at: null, created_at: null };
        const prof = profileById.get(r.user_id) ?? { full_name: null };
        const a = actByUser.get(r.user_id) ?? { minutes: 0, sessions: 0, last_seen: null };
        return {
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          joined_at: r.created_at,
          email: auth.email,
          full_name: prof.full_name,
          account_created_at: auth.created_at,
          last_sign_in_at: auth.last_sign_in_at,
          last_seen_at: a.last_seen,
          minutes_30d: a.minutes,
          sessions_30d: a.sessions,
        };
      });

      return json({ members });
    }

    if (action === "create") {
      const role = body?.role === "client" ? "client" : "manager";
      const max_uses = Math.min(Math.max(Number(body?.max_uses ?? 4), 1), 50);
      const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 365);
      const expires_at = new Date(Date.now() + days * 86400000).toISOString();

      // Generate unique token
      let token = generateToken(12);
      for (let i = 0; i < 5; i++) {
        const { data: dup } = await admin
          .from("workspace_invite_links")
          .select("id")
          .eq("token", token)
          .maybeSingle();
        if (!dup) break;
        token = generateToken(12);
      }

      const { data: created, error: insErr } = await admin
        .from("workspace_invite_links")
        .insert({ workspace_id, token, role, max_uses, expires_at, created_by: caller.id })
        .select("id, token, role, max_uses, used_count, expires_at, created_at")
        .single();
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ ok: true, ...created });
    }

    if (action === "list") {
      const { data, error } = await admin
        .from("workspace_invite_links")
        .select("id, token, role, max_uses, used_count, expires_at, revoked_at, created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return json({ error: error.message }, 500);
      return json({ links: data });
    }

    if (action === "revoke") {
      const id = String(body?.id ?? "");
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await admin
        .from("workspace_invite_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspace_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

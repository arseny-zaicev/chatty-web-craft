import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // one-off; will be deleted right after use

  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "client.test@iskra.ae").toLowerCase();
  const password = body.password ?? "TestClient!2026";
  const workspaceSlug = body.workspace_slug ?? "company15";
  const role = body.role === "manager" ? "manager" : "client";

  const admin = createClient(url, srv, { auth: { persistSession: false } });

  // Find or create user
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list.data?.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }

  const { data: ws } = await admin.from("workspaces").select("id, slug").eq("slug", workspaceSlug).single();
  if (!ws) return new Response(JSON.stringify({ error: "workspace not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

  const { data: existing } = await admin.from("workspace_members").select("id").eq("workspace_id", ws.id).eq("user_id", user!.id).maybeSingle();
  if (existing) {
    await admin.from("workspace_members").update({ role }).eq("id", existing.id);
  } else {
    await admin.from("workspace_members").insert({ workspace_id: ws.id, user_id: user!.id, role });
  }

  return new Response(JSON.stringify({ ok: true, email, password, workspace: ws.slug, role, user_id: user!.id }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

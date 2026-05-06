const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require admin secret to prevent unauthorized webhook re-registration / metadata leakage
  const adminSecret = req.headers.get("x-admin-secret");
  const expectedSecret = Deno.env.get("ADMIN_INIT_SECRET");
  if (!expectedSecret || adminSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const TOKEN = Deno.env.get("CALENDLY_API_TOKEN");
  if (!TOKEN) {
    return new Response(JSON.stringify({ error: "CALENDLY_API_TOKEN not set" }), { status: 500, headers: corsHeaders });
  }
  const WEBHOOK_URL = "https://xglfamaaotmwulglwcui.supabase.co/functions/v1/calendly-webhook";

  const me = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const meData = await me.json();
  if (!me.ok) {
    return new Response(JSON.stringify({ step: "me", status: me.status, body: meData }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userUri = meData.resource?.uri;
  const orgUri = meData.resource?.current_organization;

  // List existing
  const listRes = await fetch(`https://api.calendly.com/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&user=${encodeURIComponent(userUri)}&scope=user`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const existing = await listRes.json();

  // Delete any existing pointing to our webhook
  for (const sub of (existing.collection ?? [])) {
    if (sub.callback_url === WEBHOOK_URL) {
      await fetch(sub.uri, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } });
    }
  }

  const createRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      events: ["invitee.created", "invitee.canceled"],
      organization: orgUri,
      user: userUri,
      scope: "user",
    }),
  });
  const createBody = await createRes.json();

  return new Response(JSON.stringify({
    me: { userUri, orgUri },
    existing,
    create: { status: createRes.status, body: createBody },
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

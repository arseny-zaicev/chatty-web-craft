// Periodically syncs WhatsApp number health from Gupshup.
// Updates status / messaging_limit / quality_rating / display_name_status.
// Changes to status / messaging_limit trigger the existing DB trigger
// `enqueue_number_slack_event` which posts to Slack automatically.
//
// Triggered by pg_cron every 15 minutes. Can also be invoked ad-hoc with
// { number_id: "<uuid>" } to force-sync a single number.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NumberRow = {
  id: string;
  phone_number: string;
  provider_app_id: string | null;
  provider_api_key: string | null;
  status: string | null;
  messaging_limit: string | null;
  display_name_status: string | null;
  quality_rating: string | null;
};

const GLOBAL_KEY = Deno.env.get("GUPSHUP_API_KEY") || "";

async function tryFetch(url: string, headers: Record<string, string>): Promise<any | null> {
  try {
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await r.json();
    const text = await r.text();
    try { return JSON.parse(text); } catch { return null; }
  } catch { return null; }
}

async function fetchAppHealth(appId: string, perKey: string | null): Promise<{
  status?: string;
  messagingLimit?: string;
  quality?: string;
  displayNameStatus?: string;
  raw?: any;
  error?: string;
} | null> {
  const candidates: Array<{ url: string; headers: Record<string, string> }> = [];
  const keys = [perKey, GLOBAL_KEY].filter(Boolean) as string[];

  for (const k of keys) {
    const isPartner = k.startsWith("sk_");
    if (isPartner) {
      candidates.push({
        url: `https://partner.gupshup.io/partner/app/${appId}/ratings`,
        headers: { Authorization: k },
      });
      candidates.push({
        url: `https://partner.gupshup.io/partner/app/${appId}`,
        headers: { Authorization: k },
      });
    }
    candidates.push({
      url: `https://api.gupshup.io/sm/api/v2/app/${appId}/ratings`,
      headers: { apikey: k },
    });
    candidates.push({
      url: `https://api.gupshup.io/wa/app/${appId}`,
      headers: { apikey: k },
    });
  }

  let merged: any = {};
  let lastErr = "no endpoint reachable";
  for (const c of candidates) {
    const res = await tryFetch(c.url, c.headers);
    if (!res) { lastErr = `failed ${c.url}`; continue; }
    merged = { ...merged, ...res };
    lastErr = "";
  }
  if (!Object.keys(merged).length) return { error: lastErr };

  // Normalize across possible shapes
  const messagingLimit = String(
    merged.messagingLimit || merged.messaging_limit ||
    merged?.healthEntry?.messagingLimit || merged?.tier || ""
  ).toUpperCase() || undefined;

  const quality = String(
    merged.quality || merged.qualityRating || merged.quality_rating ||
    merged?.healthEntry?.quality || ""
  ).toUpperCase() || undefined;

  const accountState = String(
    merged.accountState || merged.account_status || merged.status ||
    merged?.healthEntry?.accountState || ""
  ).toUpperCase();

  const displayNameStatus = String(
    merged.nameStatus || merged.displayNameStatus || ""
  ).toUpperCase() || undefined;

  // Map to our status enum: active | restricted | banned
  let status: string | undefined;
  if (accountState === "BANNED" || accountState === "DISABLED") status = "banned";
  else if (accountState === "FLAGGED" || accountState === "RESTRICTED" || quality === "RED") status = "restricted";
  // Note: do NOT auto-promote to "active" here. Numbers in "stock"/"ready"/"warming"
  // states are managed manually; we only push status downward (toward banned/restricted)
  // based on Gupshup signals. Quality + messaging_limit fields still update.

  return { status, messagingLimit, quality, displayNameStatus, raw: merged };
}

Deno.serve(cronGuard({ jobName: "numbers-health-sync", lock: true }, async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let onlyId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.number_id) onlyId = String(body.number_id);
    } catch { /* ignore */ }
  }

  let q = supabase
    .from("whatsapp_numbers")
    .select("id, phone_number, provider_app_id, provider_api_key, status, messaging_limit, display_name_status, quality_rating")
    .eq("is_active", true)
    .not("provider_app_id", "is", null);
  if (onlyId) q = q.eq("id", onlyId);

  const { data: numbers, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let synced = 0, changed = 0, failed = 0;
  const details: any[] = [];

  // Parallelize per-number Gupshup fetches to keep total runtime under the
  // edge function timeout when fleet grows. Each iteration still does its
  // own DB update, so we cap concurrency to avoid hammering Gupshup.
  const CONCURRENCY = 6;
  const list = (numbers || []) as NumberRow[];
  const processOne = async (n: NumberRow) => {
    const result = await fetchAppHealth(n.provider_app_id!, n.provider_api_key);
    const nowIso = new Date().toISOString();

    if (!result || result.error) {
      failed++;
      await supabase.from("whatsapp_numbers").update({
        last_health_sync_at: nowIso,
        last_health_sync_error: (result?.error || "unknown").slice(0, 500),
      }).eq("id", n.id);
      details.push({ id: n.id, phone: n.phone_number, error: result?.error });
      return;
    }

    const update: Record<string, unknown> = {
      last_health_sync_at: nowIso,
      last_health_sync_error: null,
    };
    let didChange = false;

    if (result.status && result.status !== n.status) { update.status = result.status; didChange = true; }
    if (result.messagingLimit && result.messagingLimit !== n.messaging_limit) { update.messaging_limit = result.messagingLimit; didChange = true; }
    if (result.quality && result.quality !== n.quality_rating) { update.quality_rating = result.quality; didChange = true; }
    if (result.displayNameStatus && result.displayNameStatus !== n.display_name_status) {
      update.display_name_status = result.displayNameStatus;
      update.display_name_checked_at = nowIso;
      didChange = true;
    }
    if (result.status === "restricted" && n.status !== "restricted") update.restricted_at = nowIso;

    const { error: upErr } = await supabase.from("whatsapp_numbers").update(update).eq("id", n.id);
    if (upErr) {
      failed++;
      details.push({ id: n.id, phone: n.phone_number, error: upErr.message });
      return;
    }
    synced++;
    if (didChange) changed++;
    details.push({ id: n.id, phone: n.phone_number, changed: didChange, ...result });
  };

  for (let i = 0; i < list.length; i += CONCURRENCY) {
    const slice = list.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(processOne));
  }

  return new Response(JSON.stringify({
    total: numbers?.length || 0, synced, changed, failed, details: onlyId ? details : undefined,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}));

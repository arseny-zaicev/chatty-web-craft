// lead-dispatch: every minute, picks pending lead_imports, ensures a rolling
// "first_touch" campaign per pipeline (one sibling per sender number), inserts
// campaign_recipients, and flips lead_imports to `queued`. The existing
// `campaigns` dispatcher then sends them on schedule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---- scheduling helpers (subset of campaigns/index.ts) ----
const hhmmToMin = (s: string, isEnd = false) => {
  const raw = String(s || (isEnd ? "18:00" : "09:00"));
  const [h, m] = raw.split(":").map((x) => parseInt(x, 10) || 0);
  // Treat "00:00" as end-of-day when used as window end.
  if (isEnd && h === 0 && m === 0) return 24 * 60;
  return Math.max(0, Math.min(24 * 60, h * 60 + m));
};
const tzOffsetMinutes = (tz: string, at: Date): number => {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p: any = {}; for (const x of dtf.formatToParts(at)) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch { return 0; }
};
const dateAtTzToUTC = (dateStr: string, hhmm: string, tz: string, isEnd = false): Date => {
  const [Y, M, D] = dateStr.split("-").map((x) => parseInt(x, 10));
  let [h, m] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
  // "00:00" as end-of-day means next day 00:00.
  let dayOffset = 0;
  if (isEnd && h === 0 && m === 0) { dayOffset = 1; }
  const naive = Date.UTC(Y, (M || 1) - 1, (D || 1) + dayOffset, h || 0, m || 0, 0);
  return new Date(naive - tzOffsetMinutes(tz, new Date(naive)) * 60_000);
};
const dayKey = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));
const exponentialGap = (ratePerSec: number) => {
  if (ratePerSec <= 0) return 0;
  const u = Math.max(1e-9, Math.random());
  return -Math.log(u) / ratePerSec;
};

// ---- Slack enqueue ----
async function enqueueSlack(admin: any, event_type: string, workspace_id: string, payload: any) {
  await admin.from("slack_event_queue").insert({ event_type, workspace_id, payload });
}

// ---- Per-pipeline processing ----
type Pipeline = {
  id: string; user_id: string; workspace_id: string; name: string;
  auto_outreach_enabled: boolean;
  first_touch_template_id: string | null;
  default_sender_number_ids: string[];
  sending_window: { start?: string; end?: string; timezone?: string } | null;
  daily_cap: number | null;
  slack_channel_id: string | null;
};
type Lead = {
  id: string; pipeline_id: string; workspace_id: string; phone: string; name: string | null;
};

async function processPipeline(admin: any, pipeline: Pipeline) {
  const ws = pipeline.workspace_id;
  const tz = pipeline.sending_window?.timezone || "UTC";
  const winStart = pipeline.sending_window?.start || "09:00";
  const winEnd = pipeline.sending_window?.end || "18:00";

  // Resolve template
  if (!pipeline.first_touch_template_id) {
    return blocked(admin, pipeline, "no_template", null);
  }
  const { data: tpl } = await admin
    .from("message_templates")
    .select("id, status, whatsapp_number_id, user_id")
    .eq("id", pipeline.first_touch_template_id)
    .maybeSingle();
  if (!tpl || tpl.status !== "approved") {
    return blocked(admin, pipeline, "template_not_approved", null);
  }

  // Resolve sender numbers (active only)
  const senderIds = (pipeline.default_sender_number_ids || []).filter(Boolean);
  if (senderIds.length === 0) {
    return blocked(admin, pipeline, "no_sender_numbers", null);
  }
  const { data: numbers } = await admin
    .from("whatsapp_numbers")
    .select("id, phone_number, display_name, status, user_id, is_active")
    .in("id", senderIds)
    .in("status", ["active", "ready"])
    .eq("is_active", true);
  if (!numbers || numbers.length === 0) {
    return blocked(admin, pipeline, "no_active_sender", null);
  }

  // Daily cap check (per pipeline, per UTC day)
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  let availableCapacity = Number.MAX_SAFE_INTEGER;
  if (pipeline.daily_cap && pipeline.daily_cap > 0) {
    const { count } = await admin
      .from("lead_imports")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", pipeline.id)
      .in("status", ["queued", "sent", "replied", "failed"])
      .gte("scheduled_at", todayStart.toISOString());
    availableCapacity = Math.max(0, pipeline.daily_cap - (count || 0));
  }
  if (availableCapacity === 0) {
    return blocked(admin, pipeline, "daily_cap_reached", null);
  }

  // Claim pending OR awaiting_manual leads. When auto-outreach is enabled,
  // older `awaiting_manual` rows (imported while auto was off) should also be
  // picked up - status guard allows awaiting_manual -> queued.
  const claimLimit = Math.min(200, availableCapacity);
  const { data: leads } = await admin
    .from("lead_imports")
    .select("id, pipeline_id, workspace_id, phone, name, status")
    .eq("pipeline_id", pipeline.id)
    .in("status", ["pending", "awaiting_manual"])
    .order("imported_at", { ascending: true })
    .limit(claimLimit);
  if (!leads || leads.length === 0) return { processed: 0 };

  // Get-or-create today's first-touch rolling campaigns (one per sender number)
  const today = dayKey(Date.now(), tz);
  const baseName = `First touch · ${pipeline.name} · ${today}`;
  type Sib = { campaign_id: string; whatsapp_number_id: string; user_id: string; phone: string };
  const siblings: Sib[] = [];

  for (const n of numbers) {
    const sibName = numbers.length > 1
      ? `${baseName} :: ${n.display_name || n.phone_number}`
      : baseName;
    const { data: existing } = await admin
      .from("campaigns")
      .select("id")
      .eq("workspace_id", ws)
      .eq("pipeline_id", pipeline.id)
      .eq("kind", "first_touch")
      .eq("whatsapp_number_id", n.id)
      .eq("name", sibName)
      .eq("status", "running")
      .maybeSingle();
    let campaignId = existing?.id as string | undefined;
    if (!campaignId) {
      const { data: created, error } = await admin
        .from("campaigns")
        .insert({
          user_id: n.user_id,
          workspace_id: ws,
          whatsapp_number_id: n.id,
          template_id: tpl.id,
          name: sibName,
          status: "running",
          kind: "first_touch",
          delay_min_seconds: 30,
          delay_max_seconds: 90,
          total_recipients: 0,
          scheduled_start_at: new Date().toISOString(),
          schedule_window_start: winStart + ":00",
          schedule_window_end: winEnd + ":00",
          respect_recipient_tz: false,
          scheduled_dates: [],
          pipeline_id: pipeline.id,
        })
        .select("id")
        .single();
      if (error || !created) continue;
      campaignId = created.id;
    }
    siblings.push({ campaign_id: campaignId, whatsapp_number_id: n.id, user_id: n.user_id, phone: n.phone_number });
  }
  if (siblings.length === 0) {
    return blocked(admin, pipeline, "campaign_create_failed", null);
  }

  // Schedule each lead
  const wsMin = hhmmToMin(winStart);
  const wsMax = hhmmToMin(winEnd, true);
  const windowSec = Math.max(60, (wsMax - wsMin) * 60);
  const avgGap = Math.max(15, Math.min(120, windowSec / Math.max(1, leads.length)));
  // Per-sibling cursor
  const cursor = new Map<string, number>();
  let nowMs = Date.now() + 30_000;
  // Snap to today's window
  const ensureInside = (ms: number): number => {
    const d = dayKey(ms, tz);
    const startUtc = dateAtTzToUTC(d, winStart, tz).getTime();
    const endUtc = dateAtTzToUTC(d, winEnd, tz, true).getTime();
    if (ms < startUtc) return startUtc;
    if (ms >= endUtc) {
      const next = new Date(ms + 24 * 3600_000);
      const nd = dayKey(next.getTime(), tz);
      return dateAtTzToUTC(nd, winStart, tz).getTime();
    }
    return ms;
  };
  for (const s of siblings) cursor.set(s.campaign_id, ensureInside(nowMs));

  const recipientRows: any[] = [];
  const leadUpdates: Array<{ id: string; campaign_id: string; recipient_idx: number }> = [];
  let i = 0;
  for (const lead of leads as Lead[]) {
    const sib = siblings[i % siblings.length];
    let cur = cursor.get(sib.campaign_id)!;
    const gap = exponentialGap(1 / avgGap);
    cur = ensureInside(cur + Math.max(15, Math.min(180, gap)) * 1000);
    cursor.set(sib.campaign_id, cur);
    recipientRows.push({
      campaign_id: sib.campaign_id,
      user_id: sib.user_id,
      workspace_id: ws,
      whatsapp_number_id: sib.whatsapp_number_id,
      contact_phone: lead.phone,
      contact_name: lead.name,
      variables: {},
      status: "scheduled",
      scheduled_at: new Date(cur).toISOString(),
    });
    leadUpdates.push({ id: lead.id, campaign_id: sib.campaign_id, recipient_idx: recipientRows.length - 1 });
    i++;
  }

  // Insert recipients (returning ids so we can link lead_imports)
  const { data: inserted, error: recErr } = await admin
    .from("campaign_recipients")
    .insert(recipientRows)
    .select("id, campaign_id, contact_phone, scheduled_at");
  if (recErr || !inserted) {
    return { processed: 0, error: recErr?.message };
  }

  // Map back: leadUpdates was built in same order as recipientRows; rely on returned order
  // but be defensive: match by (campaign_id, contact_phone, scheduled_at)
  const recMap = new Map<string, { id: string; scheduled_at: string }>();
  for (const r of inserted) {
    recMap.set(`${r.campaign_id}|${r.contact_phone}|${r.scheduled_at}`, { id: r.id, scheduled_at: r.scheduled_at });
  }

  let queued = 0;
  for (let k = 0; k < leadUpdates.length; k++) {
    const lu = leadUpdates[k];
    const rr = recipientRows[lu.recipient_idx];
    const key = `${rr.campaign_id}|${rr.contact_phone}|${rr.scheduled_at}`;
    const rec = recMap.get(key);
    if (!rec) continue;
    const { error: uErr } = await admin
      .from("lead_imports")
      .update({
        status: "queued",
        campaign_id: lu.campaign_id,
        campaign_recipient_id: rec.id,
        scheduled_at: rec.scheduled_at,
      })
      .eq("id", lu.id)
      .in("status", ["pending", "awaiting_manual"]);
    if (!uErr) queued++;
  }

  // Bump campaigns.total_recipients
  const perCampaign = new Map<string, number>();
  for (const r of inserted) perCampaign.set(r.campaign_id, (perCampaign.get(r.campaign_id) || 0) + 1);
  for (const [cid, n] of perCampaign) {
    const { data: c } = await admin.from("campaigns").select("total_recipients").eq("id", cid).single();
    await admin.from("campaigns").update({ total_recipients: (c?.total_recipients || 0) + n }).eq("id", cid);
  }

  if (queued > 0) {
    await enqueueSlack(admin, "lead.dispatched", ws, {
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      queued,
      sender_count: siblings.length,
      slack_channel_id: pipeline.slack_channel_id,
    });
  }

  return { pipeline_id: pipeline.id, processed: queued };
}

async function blocked(admin: any, pipeline: Pipeline, reason: string, error: string | null) {
  // Throttle: only emit once per hour per (pipeline, reason)
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("slack_event_queue")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "lead.dispatch_blocked")
    .eq("workspace_id", pipeline.workspace_id)
    .gte("created_at", since)
    .filter("payload->>pipeline_id", "eq", pipeline.id)
    .filter("payload->>reason", "eq", reason);
  if ((count || 0) === 0) {
    await enqueueSlack(admin, "lead.dispatch_blocked", pipeline.workspace_id, {
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      reason,
      error,
      slack_channel_id: pipeline.slack_channel_id,
    });
  }
  return { pipeline_id: pipeline.id, processed: 0, blocked: reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find pipelines with auto_outreach_enabled AND at least one pending lead
    const { data: pipelinesNeedingWork } = await admin
      .from("lead_imports")
      .select("pipeline_id")
      .eq("status", "pending")
      .limit(1000);
    const pipelineIds = Array.from(new Set((pipelinesNeedingWork ?? []).map((r: any) => r.pipeline_id).filter(Boolean)));
    if (pipelineIds.length === 0) return json({ ok: true, processed: 0, pipelines: 0 });

    const { data: pipelines } = await admin
      .from("pipelines")
      .select("id, user_id, workspace_id, name, auto_outreach_enabled, first_touch_template_id, default_sender_number_ids, sending_window, daily_cap, slack_channel_id")
      .in("id", pipelineIds)
      .eq("auto_outreach_enabled", true);

    const results: any[] = [];
    for (const p of (pipelines ?? []) as Pipeline[]) {
      try {
        results.push(await processPipeline(admin, p));
      } catch (e) {
        results.push({ pipeline_id: p.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ ok: true, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

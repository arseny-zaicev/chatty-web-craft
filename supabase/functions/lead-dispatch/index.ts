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
  payload?: Record<string, any> | null;
};

// Build template variables for first-touch send. Falls back gracefully so
// Gupshup never gets an empty params array (which causes #131008).
function buildVariables(tpl: { variables: any } | null, lead: Lead): Record<string, string> {
  const vars = Array.isArray(tpl?.variables) ? tpl!.variables : [];
  const payload = (lead.payload && typeof lead.payload === "object") ? lead.payload : {};
  const firstName = (lead.name || (payload as any).full_name || (payload as any).name || "")
    .toString().trim().split(/\s+/)[0] || "there";
  const out: Record<string, string> = {};
  for (const key of vars) {
    const k = String(key);
    if (k === "1" || k.toLowerCase() === "name" || k.toLowerCase() === "first_name") {
      out[k] = firstName;
    } else if ((payload as any)[k] != null) {
      out[k] = String((payload as any)[k]);
    } else {
      out[k] = firstName; // safe non-empty fallback
    }
  }
  // Mirror useful payload fields for downstream UI/metadata (kept in variables JSONB).
  const passthrough = [
    "company_name", "email", "form_name", "campaign_name", "adset_name", "ad_name",
    "do_you_currently_own_or_manage_a_meta_business_manager?",
    "has_this_business_manager_previously_run_ads?",
    "is_the_business_manager_verified?",
  ];
  for (const k of passthrough) {
    const v = (payload as any)[k];
    if (v != null && v !== "") out[`_${k}`] = String(v).slice(0, 500);
  }
  return out;
}

async function processPipeline(admin: any, pipeline: Pipeline) {
  const ws = pipeline.workspace_id;
  const tz = pipeline.sending_window?.timezone || "UTC";
  const winStart = pipeline.sending_window?.start || "09:00";
  const winEnd = pipeline.sending_window?.end || "18:00";

  // Rollout-safety backstop: refuse to dispatch if no Slack channel is wired.
  // The UI already enforces this in the readiness checklist; this guards against
  // direct DB edits or older pipelines flipped on without configuration.
  if (!pipeline.slack_channel_id) {
    return blocked(admin, pipeline, "missing_slack_channel", null);
  }

  // Resolve template
  if (!pipeline.first_touch_template_id) {
    return blocked(admin, pipeline, "no_template", null);
  }
  const { data: tpl } = await admin
    .from("message_templates")
    .select("id, status, whatsapp_number_id, user_id, variables, body")
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

  // Claim pending OR awaiting_manual leads that DO NOT yet have a recipient.
  // The campaign_recipient_id guard prevents the cron from re-queuing the same
  // lead every minute when an earlier update missed.
  const claimLimit = Math.min(200, availableCapacity);
  const { data: leads } = await admin
    .from("lead_imports")
    .select("id, pipeline_id, workspace_id, phone, name, status, payload, campaign_recipient_id")
    .eq("pipeline_id", pipeline.id)
    .in("status", ["pending", "awaiting_manual"])
    .is("campaign_recipient_id", null)
    .order("imported_at", { ascending: true })
    .limit(claimLimit);
  console.log(`[lead-dispatch] pipeline=${pipeline.id} claimable=${leads?.length ?? 0}`);
  if (!leads || leads.length === 0) return { processed: 0 };

  // Hard duplicate guard: if this phone already has an ACTIVE first-touch
  // recipient in this pipeline (pending/scheduled/sent/replied), skip the lead.
  // Failed recipients do NOT block (allows manual retry).
  const phones = Array.from(new Set((leads as any[]).map((l) => l.phone).filter(Boolean)));
  const blockedPhones = new Set<string>();
  if (phones.length) {
    const { data: existingRecs } = await admin
      .from("campaign_recipients")
      .select("contact_phone, status, campaigns!inner(pipeline_id, kind)")
      .in("contact_phone", phones)
      .in("status", ["pending", "scheduled", "sent", "replied"])
      .eq("campaigns.pipeline_id", pipeline.id)
      .eq("campaigns.kind", "first_touch");
    for (const r of existingRecs || []) blockedPhones.add(String((r as any).contact_phone));
  }
  if (blockedPhones.size) {
    const dupLeadIds = (leads as any[]).filter((l) => blockedPhones.has(l.phone)).map((l) => l.id);
    if (dupLeadIds.length) {
      await admin
        .from("lead_imports")
        .update({ status: "skipped", error: "duplicate first-touch (already messaged in this pipeline)" })
        .in("id", dupLeadIds)
        .in("status", ["pending", "awaiting_manual"]);
      console.log(`[lead-dispatch] pipeline=${pipeline.id} skipped_duplicates=${dupLeadIds.length}`);
    }
  }
  const filteredLeads = (leads as any[]).filter((l) => !blockedPhones.has(l.phone));
  if (filteredLeads.length === 0) return { processed: 0, skipped_duplicates: blockedPhones.size };
  (leads as any).length = 0;
  for (const l of filteredLeads) (leads as any).push(l);

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
      variables: buildVariables(tpl as any, lead),
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

  // PostgREST insert returns rows in the same order they were inserted.
  // Linking by index avoids timestamp string mismatches (microsecond rounding).
  let queued = 0;
  for (let k = 0; k < leadUpdates.length; k++) {
    const lu = leadUpdates[k];
    const rec = inserted[lu.recipient_idx];
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
    if (uErr) {
      // Couldn't claim the lead -> cancel the orphan recipient so cron does not double-send
      await admin
        .from("campaign_recipients")
        .update({ status: "failed", error_message: `lead update failed: ${uErr.message}` })
        .eq("id", rec.id);
      continue;
    }
    queued++;
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

    // Heartbeat (best-effort)
    admin.from("system_heartbeats").upsert({
      name: "lead-dispatch",
      last_run_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    // Stuck queued recovery: any lead in `queued` >10m without sent_at goes back
    // to `pending` so the next tick can re-attempt. We only recover leads whose
    // linked recipient is ALSO stuck (status='scheduled') - skip recipients in
    // 'sending' (currently being processed) or 'sent' (mirror trigger may not
    // have fired yet) to avoid double-sends and false-failures.
    const stuckCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: stuckRaw } = await admin
      .from("lead_imports")
      .select("id, campaign_recipient_id, campaign_recipients!inner(id, status)")
      .eq("status", "queued")
      .is("sent_at", null)
      .lt("scheduled_at", stuckCutoff)
      .eq("campaign_recipients.status", "scheduled")
      .limit(200);
    const stuck = (stuckRaw ?? []) as any[];
    if (stuck.length > 0) {
      const stuckIds = stuck.map((s: any) => s.id);
      const stuckRecIds = stuck.map((s: any) => s.campaign_recipient_id).filter(Boolean);
      console.log(`[lead-dispatch] recovering ${stuckIds.length} stuck queued lead(s)`);
      if (stuckRecIds.length) {
        await admin.from("campaign_recipients")
          .update({ status: "failed", error_message: "stuck queued >10m, recovered" })
          .in("id", stuckRecIds)
          .eq("status", "scheduled"); // double-check status hasn't changed since SELECT
      }
      await admin.from("lead_imports")
        .update({ status: "pending", campaign_recipient_id: null, scheduled_at: null, error: "recovered from stuck queued" })
        .in("id", stuckIds)
        .eq("status", "queued");
    }

    // Find pipelines with auto_outreach_enabled AND at least one pending or
    // awaiting_manual lead (the latter covers leads imported while auto was off).
    const { data: pipelinesNeedingWork } = await admin
      .from("lead_imports")
      .select("pipeline_id")
      .in("status", ["pending", "awaiting_manual"])
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

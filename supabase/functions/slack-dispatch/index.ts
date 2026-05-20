// Drains slack_event_queue and posts formatted Block Kit messages to the right channels.
// Triggered by pg_cron every minute and ad-hoc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acquireJobLock } from "../_shared/jobLock.ts";
import { cronGuard } from "../_shared/cronGuard.ts";
import {
  buildCampaignGroupBlocks,
  buildNumberAlertBlocks,
  buildPositiveLeadBlocks,
  buildInboxSpikeBlocks,
  buildGupshupMailAlertBlocks,
  postSlack,
  splitCampaignName,
} from "../_shared/slackBlocks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPS_CAMPAIGNS = Deno.env.get("SLACK_OPS_CAMPAIGNS_CHANNEL_ID") || "";
const OPS_NUMBERS   = Deno.env.get("SLACK_OPS_NUMBERS_CHANNEL_ID") || "";
const OPS_FINANCE   = Deno.env.get("SLACK_OPS_FINANCE_CHANNEL_ID") || "";

const CAMPAIGN_EVENTS = new Set([
  "campaign_launched", "campaign_resumed", "campaign_paused",
  "campaign_completed", "campaign_cancelled", "campaign_scheduled", "campaign_failed",
  "campaign_day_completed",
]);
const NUMBER_EVENTS = new Set([
  "number_restricted", "number_blocked", "number_recovered", "number_quality_changed",
]);

function buildFirstReplyBlocks(ws: any, p: any) {
  const wsTag = ws?.name ? `${ws.name}${ws.internal_code ? `-${ws.internal_code}` : ""}` : "Workspace";
  const name = p?.contact_name || "Unknown";
  const phone = p?.contact_phone ? `+${String(p.contact_phone).replace(/^\+/, "")}` : "-";
  const reply = p?.last_message_text ? String(p.last_message_text).slice(0, 500) : "(no text)";
  const appBase = Deno.env.get("APP_BASE_URL") || "";
  const wsSlug = ws?.slug || ws?.id || "";
  const inboxUrl = appBase && wsSlug ? `${appBase}/ws/${wsSlug}/inbox?c=${p?.conversation_id || ""}` : null;

  // Surface form answers if present
  const payload = (p?.payload || {}) as Record<string, any>;
  const answerLines: string[] = [];
  const skipKeys = new Set(["phone", "name", "full_name", "first_name", "last_name", "country", "country_code"]);
  for (const [k, v] of Object.entries(payload)) {
    if (skipKeys.has(k.toLowerCase())) continue;
    if (v == null || v === "") continue;
    if (typeof v === "object") continue;
    if (answerLines.length >= 6) break;
    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    answerLines.push(`*${label}:* ${String(v).slice(0, 160)}`);
  }

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: "💬 New lead reply", emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: `*${wsTag}*` }] },
    { type: "section", text: { type: "mrkdwn", text: `*${name}* · ${phone}` } },
    { type: "section", text: { type: "mrkdwn", text: `> ${reply.replace(/\n/g, "\n> ")}` } },
  ];
  if (answerLines.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: answerLines.join("\n") } });
  }
  if (inboxUrl) {
    blocks.push({
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: "Open in Inbox" }, url: inboxUrl, style: "primary" }],
    });
  }
  return { text: `💬 New reply from ${name} · ${wsTag}`, blocks };
}

// Cross-event dedupe: did we already send a Slack notification of this event_type
// for this conversation in the last 60 minutes? Used to suppress duplicate
// pipeline-channel pings when both positive_lead and lead.first_reply fire
// for the same reply.
async function alreadyNotified(supabase: any, eventType: string, conversationId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("slack_event_queue")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .eq("status", "sent")
    .gte("processed_at", since)
    .filter("payload->>conversation_id", "eq", conversationId);
  return (count ?? 0) > 0;
}

Deno.serve(cronGuard("slack-dispatch", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Prevent two dispatcher invocations from draining the same rows in parallel
  // (cron + manual trigger, or slow run colliding with the next tick).
  const release = await acquireJobLock(supabase, "slack-dispatch");
  if (!release) {
    return new Response(JSON.stringify({ skipped: "locked" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {

  // --- Backfill coalescer ---------------------------------------------------
  // lead.first_reply events with source='backfill_missed_first_reply' or
  // 'watchdog_backfill' should NOT spam client channels one-by-one. Group all
  // pending backfill events by (workspace, pipeline_channel) and post a single
  // digest, then mark them all as sent. This runs before the normal drain so
  // backfills don't compete for the 50-row limit.
  const { data: backfillRowsRaw } = await supabase
    .from("slack_event_queue")
    .select("*")
    .eq("status", "pending")
    .eq("event_type", "lead.first_reply")
    .limit(2000);
  const backfillRows: any[] = [];
  for (const r of backfillRowsRaw || []) {
    const p = (r.payload as any) || {};
    const src = p?.source;
    if (src !== "backfill_missed_first_reply" && src !== "watchdog_backfill") continue;

    if (!p?.force && p?.conversation_id) {
      const { data: gate } = await supabase.rpc("should_notify_lead_reply", {
        _conversation_id: p.conversation_id,
        _reply_text: p?.last_message_text ?? null,
      });
      if (!gate) {
        await supabase.from("slack_event_queue")
          .update({ status: "skipped", processed_at: new Date().toISOString(), error: "guardrail: unqualified backfill" })
          .eq("id", r.id);
        continue;
      }
    }

    backfillRows.push(r);
  }
  if (backfillRows && backfillRows.length > 0) {
    type Group = { ws: any; channel: string | null; rows: any[] };
    const groups = new Map<string, Group>();
    const wsCache = new Map<string, any>();
    for (const r of backfillRows) {
      let ws = r.workspace_id ? wsCache.get(r.workspace_id) : null;
      if (r.workspace_id && !ws) {
        const { data } = await supabase
          .from("workspaces")
          .select("id, name, slug, internal_code, slack_channel_id")
          .eq("id", r.workspace_id).maybeSingle();
        ws = data || null;
        if (ws) wsCache.set(r.workspace_id, ws);
      }
      const channel = (r.payload as any)?.slack_channel_id || ws?.slack_channel_id || null;
      const key = `${r.workspace_id || "_"}::${channel || "_"}`;
      if (!groups.has(key)) groups.set(key, { ws, channel, rows: [] });
      groups.get(key)!.rows.push(r);
    }
    for (const g of groups.values()) {
      const ids = g.rows.map((r) => r.id);
      const lines = g.rows.slice(0, 25).map((r) => {
        const p = (r.payload as any) || {};
        const name = p.contact_name || "Unknown";
        const phone = p.contact_phone ? `+${String(p.contact_phone).replace(/^\+/, "")}` : "-";
        const txt = p.last_message_text ? String(p.last_message_text).slice(0, 80) : "(no text)";
        return `• *${name}* · ${phone} — ${txt}`;
      });
      const more = g.rows.length > 25 ? `\n…and ${g.rows.length - 25} more — open the CRM Inbox to review.` : "";
      const wsTag = g.ws?.name ? `${g.ws.name}${g.ws.internal_code ? `-${g.ws.internal_code}` : ""}` : "Workspace";
      const text = `🛟 *Reply notification recovery* · ${wsTag}\nWe detected *${g.rows.length}* recent reply(ies) that were not delivered to Slack at the time. Recovered list:\n${lines.join("\n")}${more}`;
      const msg = { text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] };
      if (g.channel) {
        try { await postSlack(g.channel, msg); } catch (e) { console.warn("backfill digest post failed", e); }
      }
      // Always mirror to Iskra delivery-leads
      try { await postSlack("delivery-leads", msg); } catch { /* ignore */ }
      await supabase.from("slack_event_queue")
        .update({ status: "sent", processed_at: new Date().toISOString(), error: "coalesced into backfill digest" })
        .in("id", ids);
    }
  }
  // --- /coalescer -----------------------------------------------------------

  const { data: events, error } = await supabase
    .from("slack_event_queue")
    .select("*")
    .eq("status", "pending")
    // status='failed' is terminal (set below when attempts >= max_attempts), so filtering on status is sufficient.
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0; let failed = 0;
  for (const ev of events || []) {
    try {
      let ws: { id: string; name: string; slug: string | null; internal_code: string | null } | null = null;
      let workspaceChannel: string | null = null;
      let inboxAlertsEnabled = false;
      if (ev.workspace_id) {
        const { data } = await supabase
          .from("workspaces")
          .select("id, name, slug, internal_code, slack_channel_id, inbox_alerts_enabled")
          .eq("id", ev.workspace_id)
          .maybeSingle();
        if (data) {
          ws = { id: data.id, name: data.name, slug: data.slug, internal_code: data.internal_code };
          workspaceChannel = data.slack_channel_id || null;
          inboxAlertsEnabled = !!data.inbox_alerts_enabled;
        }
      }

      const targets = new Set<string>();

      if (CAMPAIGN_EVENTS.has(ev.event_type)) {
        if (!ws) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const evPayload = ev.payload as any;
        const campaignName = String(evPayload?.campaign_name || "Untitled");
        const { base } = splitCampaignName(campaignName);

        // Find sibling pending events: same workspace, same event_type, same base name, within ±5 min.
        const evCreatedAt = new Date(ev.created_at).getTime();
        const winStart = new Date(evCreatedAt - 5 * 60 * 1000).toISOString();
        const winEnd = new Date(evCreatedAt + 5 * 60 * 1000).toISOString();
        const { data: siblingsRaw } = await supabase
          .from("slack_event_queue")
          .select("*")
          .eq("status", "pending")
          .eq("event_type", ev.event_type)
          .eq("workspace_id", ev.workspace_id)
          .gte("created_at", winStart)
          .lte("created_at", winEnd);
        const siblings = (siblingsRaw || []).filter((s: any) => {
          const n = String((s.payload as any)?.campaign_name || "");
          return splitCampaignName(n).base === base;
        });
        // Ensure current event is included (it is, since we queried 'pending')
        const groupEvents = siblings.length > 0 ? siblings : [ev];

        // Resolve numbers in batch
        const numIds = Array.from(new Set(groupEvents.map((g: any) => (g.payload as any)?.whatsapp_number_id).filter(Boolean)));
        const phoneMap: Record<string, string> = {};
        if (numIds.length) {
          const { data: nums } = await supabase.from("whatsapp_numbers").select("id, phone_number").in("id", numIds as string[]);
          for (const n of nums || []) phoneMap[(n as any).id] = (n as any).phone_number;
        }

        let totalSum = 0, sentSum = 0, failedSum = 0;
        const parts: Array<{ phone: string | null; label: string | null; total: number; sent: number; failed: number }> = [];
        for (const g of groupEvents) {
          const p = g.payload as any;
          const t = Number(p?.total_recipients || 0);
          const s = Number(p?.sent_count || 0);
          const f = Number(p?.failed_count || 0);
          totalSum += t; sentSum += s; failedSum += f;
          const numId = p?.whatsapp_number_id;
          const { numberLabel } = splitCampaignName(String(p?.campaign_name || ""));
          parts.push({
            phone: numId ? (phoneMap[numId] || null) : null,
            label: numberLabel,
            total: t, sent: s, failed: f,
          });
        }

        const opsMsg = buildCampaignGroupBlocks({
          event: ev.event_type, ws, audience: "ops", baseName: base,
          campaignId: String(evPayload.campaign_id),
          totals: { total: totalSum, sent: sentSum, failed: failedSum },
          parts, payload: evPayload,
        });
        // Client channels only receive the end-of-day digest. Lifecycle noise
        // (launched / scheduled / paused / resumed / completed / cancelled /
        // failed) stays in OPS — clients don't need a ping for every batch we
        // approve and send during the day.
        const CLIENT_VISIBLE_CAMPAIGN_EVENTS = new Set<string>([
          "campaign_day_completed",
        ]);
        const shouldNotifyClient = CLIENT_VISIBLE_CAMPAIGN_EVENTS.has(ev.event_type);

        const clientMsg = shouldNotifyClient
          ? buildCampaignGroupBlocks({
              event: ev.event_type, ws, audience: "client", baseName: base,
              campaignId: String(evPayload.campaign_id),
              totals: { total: totalSum, sent: sentSum, failed: failedSum },
              parts, payload: evPayload,
            })
          : null;

        const postErrors: string[] = [];
        let anyOk = false;
        if (OPS_CAMPAIGNS) {
          try { await postSlack(OPS_CAMPAIGNS, opsMsg); anyOk = true; }
          catch (e) { postErrors.push(`ops: ${e instanceof Error ? e.message : String(e)}`); }
        }
        if (workspaceChannel && clientMsg) {
          try { await postSlack(workspaceChannel, clientMsg); anyOk = true; }
          catch (e) { postErrors.push(`client(${workspaceChannel}): ${e instanceof Error ? e.message : String(e)}`); }
        }

        // If at least one channel accepted, treat as delivered. Otherwise let the
        // outer catch retry (throw). This prevents re-posting to ops when the
        // client channel is misconfigured (channel_not_found, etc).
        if (!anyOk && postErrors.length) {
          throw new Error(postErrors.join(" | "));
        }

        // Mark all sibling events as sent (dedupe)
        const sentAt = new Date().toISOString();
        const ids = groupEvents.map((g: any) => g.id);
        await supabase.from("slack_event_queue")
          .update({
            status: "sent",
            processed_at: sentAt,
            error: postErrors.length ? postErrors.join(" | ").slice(0, 1000) : null,
          })
          .in("id", ids);
        processed += ids.length;
        continue;
      } else if (NUMBER_EVENTS.has(ev.event_type)) {
        const msg = buildNumberAlertBlocks({ event: ev.event_type, ws, payload: ev.payload as any });
        if (OPS_NUMBERS) targets.add(OPS_NUMBERS);
        if (workspaceChannel) targets.add(workspaceChannel);
        const numErrors: string[] = [];
        let numOk = false;
        for (const ch of targets) {
          try { await postSlack(ch, msg); numOk = true; }
          catch (e) { numErrors.push(`${ch}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        if (!numOk && numErrors.length) throw new Error(numErrors.join(" | "));
        if (numErrors.length) console.warn("number alert partial", ev.id, numErrors.join(" | "));
      } else if (ev.event_type === "positive_lead") {
        const p = ev.payload as any;
        const pipelineChannel = (p?.slack_channel_id as string) || workspaceChannel;
        if (!ws || !pipelineChannel) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        // Cross-event dedupe: if a lead.first_reply already posted for this
        // conversation in the last hour, the operator already saw the reply -
        // skip the positive_lead to avoid double-pinging the pipeline channel.
        if (p?.conversation_id && (await alreadyNotified(supabase, "lead.first_reply", p.conversation_id))) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString(), error: "deduped vs lead.first_reply" }).eq("id", ev.id);
          continue;
        }
        const msg = buildPositiveLeadBlocks({ ws, payload: p });
        await postSlack(pipelineChannel, msg);
      } else if (ev.event_type === "inbox_unread_spike") {
        const p = ev.payload as any;
        const targetChannel = (p?.slack_channel_id as string) || workspaceChannel;
        if (!ws || !targetChannel || !inboxAlertsEnabled) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const msg = buildInboxSpikeBlocks({ ws, unreadCount: p.unread_total || 0, conversations: p.conversations || [], pipelineName: p.pipeline_name || null });
        await postSlack(targetChannel, msg);
      } else if (ev.event_type === "lead.first_reply") {
        const p = ev.payload as any;
        const pipelineChannel = (p?.slack_channel_id as string) || workspaceChannel;
        if (!pipelineChannel) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        // Final guardrail: re-check qualification at dispatch time. Stops any
        // stale/buggy enqueue path (trigger, watchdog, manual backfill) from
        // pinging clients with Block / Not relevant / auto-replies / lost leads.
        // Bypassed only when the enqueuer explicitly marks payload.force=true.
        if (!p?.force && p?.conversation_id) {
          const { data: gate } = await supabase.rpc("should_notify_lead_reply", {
            _conversation_id: p.conversation_id,
            _reply_text: p?.last_message_text ?? null,
          });
          if (!gate) {
            await supabase.from("slack_event_queue")
              .update({ status: "skipped", processed_at: new Date().toISOString(), error: "guardrail: unqualified reply" })
              .eq("id", ev.id);
            continue;
          }
        }
        const msg = buildFirstReplyBlocks(ws, p);
        // Cross-event dedupe: if positive_lead already posted for this
        // conversation, skip the pipeline post but still mirror to delivery-leads
        // (positive_lead does NOT mirror, so ops still needs the signal).
        const dupedByPositive = p?.conversation_id && (await alreadyNotified(supabase, "positive_lead", p.conversation_id));
        if (!dupedByPositive) {
          await postSlack(pipelineChannel, msg);
        }
        const ISKRA_INTERNAL = "delivery-leads";
        if (pipelineChannel !== ISKRA_INTERNAL) {
          try { await postSlack(ISKRA_INTERNAL, msg); } catch (e) { console.warn("mirror first_reply failed", e); }
        }
      } else if (ev.event_type === "lead.imported" || ev.event_type === "lead.import_failed" || ev.event_type === "lead.dispatched" || ev.event_type === "lead.dispatch_blocked") {
        // Operational noise: do not notify clients in their pipeline channel.
        await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
        continue;
      } else if (ev.event_type === "member_added") {
        // Disabled: do not notify Slack on new member joining CRM.
        await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
        continue;
      } else if (ev.event_type === "gupshup_mail_alert") {
        const p = ev.payload as any;
        const msg = buildGupshupMailAlertBlocks({
          category: String(p.category || "other"),
          severity: (p.severity || "info") as "info" | "warning" | "critical",
          ws,
          payload: p,
        });
        const routing = String(p.routing || "numbers");
        const gErrors: string[] = [];
        let gOk = false;
        const post = async (ch: string) => {
          try { await postSlack(ch, msg); gOk = true; }
          catch (e) { gErrors.push(`${ch}: ${e instanceof Error ? e.message : String(e)}`); }
        };
        if (routing === "finance") {
          const financeChan = OPS_FINANCE || OPS_NUMBERS;
          if (financeChan) await post(financeChan);
        } else {
          if (OPS_NUMBERS) await post(OPS_NUMBERS);
          if (workspaceChannel) await post(workspaceChannel);
        }
        if (!gOk && gErrors.length) throw new Error(gErrors.join(" | "));
        if (gErrors.length) console.warn("gupshup alert partial", ev.id, gErrors.join(" | "));
      } else {
        await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
        continue;
      }

      await supabase
        .from("slack_event_queue")
        .update({ status: "sent", processed_at: new Date().toISOString() })
        .eq("id", ev.id);
      processed++;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("dispatch failed", ev.id, errMsg);
      const newAttempts = (ev.attempts || 0) + 1;
      const cap = ev.max_attempts ?? 5;
      await supabase
        .from("slack_event_queue")
        .update({
          attempts: newAttempts,
          error: errMsg.slice(0, 1000),
          status: newAttempts >= cap ? "failed" : "pending",
        })
        .eq("id", ev.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed, failed, total: events?.length || 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } finally {
    await release();
  }
}));

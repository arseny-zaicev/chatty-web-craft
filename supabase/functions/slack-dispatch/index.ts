// Drains slack_event_queue and posts formatted Block Kit messages to the right channels.
// Triggered by pg_cron every minute and ad-hoc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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
        const clientMsg = buildCampaignGroupBlocks({
          event: ev.event_type, ws, audience: "client", baseName: base,
          campaignId: String(evPayload.campaign_id),
          totals: { total: totalSum, sent: sentSum, failed: failedSum },
          parts, payload: evPayload,
        });

        if (OPS_CAMPAIGNS) await postSlack(OPS_CAMPAIGNS, opsMsg);
        if (workspaceChannel) await postSlack(workspaceChannel, clientMsg);

        // Mark all sibling events as sent (dedupe)
        const sentAt = new Date().toISOString();
        const ids = groupEvents.map((g: any) => g.id);
        await supabase.from("slack_event_queue")
          .update({ status: "sent", processed_at: sentAt })
          .in("id", ids);
        processed += ids.length;
        continue;
      } else if (NUMBER_EVENTS.has(ev.event_type)) {
        const msg = buildNumberAlertBlocks({ event: ev.event_type, ws, payload: ev.payload as any });
        if (OPS_NUMBERS) targets.add(OPS_NUMBERS);
        if (workspaceChannel) targets.add(workspaceChannel);
        for (const ch of targets) await postSlack(ch, msg);
      } else if (ev.event_type === "positive_lead") {
        const p = ev.payload as any;
        const pipelineChannel = (p?.slack_channel_id as string) || workspaceChannel;
        if (!ws || !pipelineChannel) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const msg = buildPositiveLeadBlocks({ ws, payload: p });
        await postSlack(pipelineChannel, msg);
        // Mirror to Iskra internal delivery-leads channel
        const ISKRA_INTERNAL = "delivery-leads";
        if (pipelineChannel !== ISKRA_INTERNAL) {
          try { await postSlack(ISKRA_INTERNAL, msg); } catch (e) { console.warn("mirror positive_lead failed", e); }
        }
      } else if (ev.event_type === "inbox_unread_spike") {
        if (!ws || !workspaceChannel || !inboxAlertsEnabled) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const p = ev.payload as any;
        const msg = buildInboxSpikeBlocks({ ws, unreadCount: p.unread_total || 0, conversations: p.conversations || [] });
        await postSlack(workspaceChannel, msg);
      } else if (ev.event_type === "lead.first_reply") {
        const p = ev.payload as any;
        const pipelineChannel = (p?.slack_channel_id as string) || workspaceChannel;
        if (!pipelineChannel) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const msg = buildFirstReplyBlocks(ws, p);
        await postSlack(pipelineChannel, msg);
        const ISKRA_INTERNAL = "delivery-leads";
        if (pipelineChannel !== ISKRA_INTERNAL) {
          try { await postSlack(ISKRA_INTERNAL, msg); } catch (e) { console.warn("mirror first_reply failed", e); }
        }
      } else if (ev.event_type === "lead.imported" || ev.event_type === "lead.import_failed" || ev.event_type === "lead.dispatched" || ev.event_type === "lead.dispatch_blocked") {
        // Operational noise: do not notify clients in their pipeline channel.
        await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
        continue;
      } else if (ev.event_type === "member_added") {
        const p = ev.payload as any;
        const wsTag = ws?.name ? `${ws.name}${ws.internal_code ? `-${ws.internal_code}` : ""}` : "Workspace";
        const who = p?.full_name || p?.email || "New user";
        const role = String(p?.role || "member");
        const email = p?.email ? ` · ${p.email}` : "";
        const text = `🟢 New user joined CRM: *${who}*${email} · role: \`${role}\` · ${wsTag}`;
        const msg = {
          text,
          blocks: [
            { type: "header", text: { type: "plain_text", text: "🟢 New user joined CRM", emoji: true } },
            { type: "context", elements: [{ type: "mrkdwn", text: `*${wsTag}*` }] },
            { type: "section", text: { type: "mrkdwn", text: `*${who}*${email}\nRole: \`${role}\`` } },
          ],
        };
        // Notify client's own Slack channel (if configured) so they see access was granted
        if (workspaceChannel) {
          try { await postSlack(workspaceChannel, msg); } catch (e) { console.warn("member_added client channel failed", e); }
        }
        // Notify our internal ops channel (delivery-leads) so we see it too
        const ISKRA_INTERNAL = "delivery-leads";
        if (workspaceChannel !== ISKRA_INTERNAL) {
          try { await postSlack(ISKRA_INTERNAL, msg); } catch (e) { console.warn("member_added ops channel failed", e); }
        }
      } else if (ev.event_type === "gupshup_mail_alert") {
        const p = ev.payload as any;
        const msg = buildGupshupMailAlertBlocks({
          category: String(p.category || "other"),
          severity: (p.severity || "info") as "info" | "warning" | "critical",
          ws,
          payload: p,
        });
        const routing = String(p.routing || "numbers");
        if (routing === "finance") {
          const financeChan = OPS_FINANCE || OPS_NUMBERS;
          if (financeChan) await postSlack(financeChan, msg);
        } else {
          if (OPS_NUMBERS) await postSlack(OPS_NUMBERS, msg);
          if (workspaceChannel) await postSlack(workspaceChannel, msg);
        }
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
});

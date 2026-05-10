// Drains slack_event_queue and posts formatted Block Kit messages to the right channels.
// Triggered by pg_cron every minute and ad-hoc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCampaignGroupBlocks,
  buildNumberAlertBlocks,
  buildPositiveLeadBlocks,
  buildInboxSpikeBlocks,
  postSlack,
  splitCampaignName,
} from "../_shared/slackBlocks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPS_CAMPAIGNS = Deno.env.get("SLACK_OPS_CAMPAIGNS_CHANNEL_ID") || "";
const OPS_NUMBERS   = Deno.env.get("SLACK_OPS_NUMBERS_CHANNEL_ID") || "";

const CAMPAIGN_EVENTS = new Set([
  "campaign_launched", "campaign_resumed", "campaign_paused",
  "campaign_completed", "campaign_cancelled", "campaign_scheduled", "campaign_failed",
]);
const NUMBER_EVENTS = new Set([
  "number_restricted", "number_blocked", "number_recovered", "number_quality_changed",
]);

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
    .lt("attempts", 5)
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
        let numberPhone: string | null = null;
        const numId = (ev.payload as any)?.whatsapp_number_id;
        if (numId) {
          const { data: n } = await supabase.from("whatsapp_numbers").select("phone_number").eq("id", numId).maybeSingle();
          numberPhone = n?.phone_number || null;
        }
        if (!ws) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const msg = buildCampaignLifecycleBlocks({ event: ev.event_type, ws, payload: ev.payload as any, numberPhone });
        if (OPS_CAMPAIGNS) targets.add(OPS_CAMPAIGNS);
        if (workspaceChannel) targets.add(workspaceChannel);
        for (const ch of targets) await postSlack(ch, msg);
      } else if (NUMBER_EVENTS.has(ev.event_type)) {
        const msg = buildNumberAlertBlocks({ event: ev.event_type, ws, payload: ev.payload as any });
        if (OPS_NUMBERS) targets.add(OPS_NUMBERS);
        if (workspaceChannel) targets.add(workspaceChannel);
        for (const ch of targets) await postSlack(ch, msg);
      } else if (ev.event_type === "positive_lead") {
        if (!ws || !workspaceChannel || !inboxAlertsEnabled) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const msg = buildPositiveLeadBlocks({ ws, payload: ev.payload as any });
        await postSlack(workspaceChannel, msg);
      } else if (ev.event_type === "inbox_unread_spike") {
        if (!ws || !workspaceChannel || !inboxAlertsEnabled) {
          await supabase.from("slack_event_queue").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", ev.id);
          continue;
        }
        const p = ev.payload as any;
        const msg = buildInboxSpikeBlocks({ ws, unreadCount: p.unread_total || 0, conversations: p.conversations || [] });
        await postSlack(workspaceChannel, msg);
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
      await supabase
        .from("slack_event_queue")
        .update({
          attempts: newAttempts,
          error: errMsg.slice(0, 1000),
          status: newAttempts >= 5 ? "failed" : "pending",
        })
        .eq("id", ev.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed, failed, total: events?.length || 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

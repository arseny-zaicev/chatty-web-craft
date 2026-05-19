// reply-notification-watchdog
//
// Hourly safety net: finds inbound replies that landed >30 min ago but have NO
// matching `lead.first_reply` or `positive_lead` event in slack_event_queue
// (sent or pending). For each such gap, enqueues a backfill event so the
// existing dispatcher delivers it like any normal first-reply ping.
//
// We also post a one-line digest to the Iskra internal channel so the team
// sees that gaps were detected and auto-recovered.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acquireJobLock } from "../_shared/jobLock.ts";
import { sendSlackMessage, SLACK_BOOKINGS_CHANNEL } from "../_shared/slack.ts";
import { cronGuard } from "../_shared/cronGuard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(cronGuard("reply-notification-watchdog", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const release = await acquireJobLock(admin, "reply-notification-watchdog");
  if (!release) {
    return new Response(JSON.stringify({ skipped: "locked" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const olderThan = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Pull recipients that flipped to replied between [now-24h, now-30m] - old
    // enough that any healthy trigger would have queued them by now.
    const { data: candidates, error } = await admin
      .from("campaign_recipients")
      .select("id, workspace_id, campaign_id, conversation_id, contact_phone, contact_name, whatsapp_number_id, updated_at")
      .eq("status", "replied")
      .not("conversation_id", "is", null)
      .gt("updated_at", since)
      .lt("updated_at", olderThan)
      .limit(500);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let enqueued = 0;
    const perWorkspace: Record<string, number> = {};

    for (const cr of candidates ?? []) {
      // Already covered? (sent or pending lead.first_reply / positive_lead)
      const { count } = await admin
        .from("slack_event_queue")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["lead.first_reply", "positive_lead"])
        .filter("payload->>conversation_id", "eq", cr.conversation_id);
      if ((count ?? 0) > 0) continue;

      // Pull conversation + pipeline routing
      const { data: conv } = await admin
        .from("conversations")
        .select("last_message_text, contact_name, pipeline_id")
        .eq("id", cr.conversation_id)
        .maybeSingle();

      // Strict qualification: only recover replies that the canonical gate
      // accepts. Block / Not relevant / auto-replies / lost-stage / unclassified
      // neutral text are silently dropped.
      const { data: gate } = await admin.rpc("should_notify_lead_reply", {
        _conversation_id: cr.conversation_id,
        _reply_text: conv?.last_message_text ?? null,
      });
      if (!gate) continue;
      let pipelineName: string | null = null;
      let slackChannel: string | null = null;
      if (conv?.pipeline_id) {
        const { data: pipe } = await admin
          .from("pipelines")
          .select("name, slack_channel_id")
          .eq("id", conv.pipeline_id)
          .maybeSingle();
        pipelineName = pipe?.name ?? null;
        slackChannel = pipe?.slack_channel_id ?? null;
      }

      const { error: insErr } = await admin.from("slack_event_queue").insert({
        event_type: "lead.first_reply",
        workspace_id: cr.workspace_id,
        payload: {
          campaign_recipient_id: cr.id,
          campaign_id: cr.campaign_id,
          pipeline_id: conv?.pipeline_id ?? null,
          pipeline_name: pipelineName,
          conversation_id: cr.conversation_id,
          contact_phone: cr.contact_phone,
          contact_name: cr.contact_name ?? conv?.contact_name ?? null,
          last_message_text: conv?.last_message_text ?? null,
          slack_channel_id: slackChannel,
          whatsapp_number_id: cr.whatsapp_number_id,
          source: "watchdog_backfill",
        },
      });
      if (!insErr) {
        enqueued++;
        perWorkspace[cr.workspace_id] = (perWorkspace[cr.workspace_id] ?? 0) + 1;
      }
    }

    if (enqueued > 0) {
      const summary = Object.entries(perWorkspace)
        .map(([ws, n]) => `${ws.slice(0, 8)}…: ${n}`)
        .join(" · ");
      await sendSlackMessage(
        SLACK_BOOKINGS_CHANNEL,
        `🛟 Reply watchdog recovered *${enqueued}* missed first-reply notification(s) (last hour).\n${summary}`,
      );
    }

    return new Response(JSON.stringify({ ok: true, scanned: candidates?.length ?? 0, enqueued }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    await release();
  }
}));

// Per-pipeline end-of-day digest. Posts a summary to each pipeline.slack_channel_id.
// Covers: leads imported, sent, delivered (replied), positive replies, manager responses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack";

async function postSlack(channel: string, text: string, blocks: unknown[]) {
  const resp = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY,
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  const j = await resp.json().catch(() => ({}));
  if (!j?.ok) console.error("slack.postMessage failed", channel, j);
  return j;
}

function todayUaeRangeUtc() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  const startUtc = new Date(`${today}T00:00:00+04:00`).toISOString();
  const endUtc = new Date(new Date(startUtc).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { startUtc, endUtc, label: today };
}

Deno.serve(cronGuard("slack-pipeline-digest", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { startUtc, endUtc, label } = todayUaeRangeUtc();

  // Pipelines that have a Slack channel
  const { data: pipelines, error: pErr } = await supabase
    .from("pipelines")
    .select("id, name, slack_channel_id, workspace_id")
    .not("slack_channel_id", "is", null);

  const wsIds = Array.from(new Set((pipelines || []).map(p => p.workspace_id).filter(Boolean)));
  const { data: wsRows } = wsIds.length
    ? await supabase.from("workspaces").select("id, name, internal_code").in("id", wsIds)
    : { data: [] as any[] };
  const wsMap = new Map((wsRows || []).map(w => [w.id, w]));

  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: corsHeaders });
  }

  const summaries: Array<{ pipeline: string; channel: string; posted: boolean }> = [];

  for (const p of pipelines || []) {
    const channel = (p as any).slack_channel_id as string;
    if (!channel) continue;

    // 1. Leads imported today
    const { count: importedCount } = await supabase
      .from("lead_imports")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", p.id)
      .gte("imported_at", startUtc)
      .lt("imported_at", endUtc);

    // 2. Status snapshot for leads imported today
    const { data: statusRows } = await supabase
      .from("lead_imports")
      .select("status")
      .eq("pipeline_id", p.id)
      .gte("imported_at", startUtc)
      .lt("imported_at", endUtc)
      .limit(5000);

    const statusCounts: Record<string, number> = {};
    for (const r of statusRows || []) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }
    const sent = (statusCounts["sent"] || 0) + (statusCounts["replied"] || 0);
    const replied = statusCounts["replied"] || 0;
    const failed = statusCounts["failed"] || 0;
    const skipped = statusCounts["skipped"] || 0;
    const queued = statusCounts["queued"] || 0;

    // 3. Positive replies today (from slack_event_queue)
    const { count: positiveCount } = await supabase
      .from("slack_event_queue")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "positive_lead")
      .gte("created_at", startUtc)
      .lt("created_at", endUtc)
      .filter("payload->>slack_channel_id", "eq", channel);

    // 4. Manager responses today (distinct conversations where outbound message sent today by a human)
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("pipeline_id", p.id);
    const convIds = (convs || []).map(c => c.id);

    let managerHandled = 0;
    if (convIds.length) {
      // chunked to avoid url length issues
      const chunkSize = 200;
      const handledSet = new Set<string>();
      for (let i = 0; i < convIds.length; i += chunkSize) {
        const slice = convIds.slice(i, i + chunkSize);
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", slice)
          .eq("direction", "outbound")
          .not("sent_by_user_id", "is", null)
          .gte("created_at", startUtc)
          .lt("created_at", endUtc);
        for (const m of msgs || []) handledSet.add(m.conversation_id as string);
      }
      managerHandled = handledSet.size;
    }

    const total = importedCount || 0;
    if (total === 0 && positiveCount === 0 && managerHandled === 0) {
      // nothing to report
      summaries.push({ pipeline: p.name, channel, posted: false });
      continue;
    }

    const ws = wsMap.get(p.workspace_id);
    const wsLabel = ws ? `${ws.name}${ws.internal_code ? `-${ws.internal_code}` : ""}` : "";

    const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0;

    const text = `End-of-day report: ${p.name}`;
    const blocks: unknown[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `📊 End-of-day - ${p.name}`, emoji: true },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `*${label}* (Asia/Dubai) · ${wsLabel}` }],
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Leads imported*\n${total}` },
          { type: "mrkdwn", text: `*Outreach sent*\n${sent}` },
          { type: "mrkdwn", text: `*Replied*\n${replied} (${replyRate}%)` },
          { type: "mrkdwn", text: `*Positive replies*\n${positiveCount || 0}` },
          { type: "mrkdwn", text: `*Manager-handled chats*\n${managerHandled}` },
          { type: "mrkdwn", text: `*Failed / skipped / queued*\n${failed} / ${skipped} / ${queued}` },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_Iskra · pipeline digest_" }],
      },
    ];

    try {
      await postSlack(channel, text, blocks);
      summaries.push({ pipeline: p.name, channel, posted: true });
    } catch (e) {
      console.error("post failed", p.name, e);
      summaries.push({ pipeline: p.name, channel, posted: false });
    }
  }

  return new Response(JSON.stringify({ ok: true, summaries }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));

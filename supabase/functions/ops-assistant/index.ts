// AI ops assistant. Lovable AI Gateway with tool calling backed by service-role read queries.
// Admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ADMIN_EMAIL = "arseny@iskra.ae";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const tools = [
  {
    type: "function",
    function: {
      name: "list_numbers",
      description: "List all WhatsApp numbers with status, client (workspace), and last activity. Use to find a number id when the user mentions a phone or label.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional substring to filter by phone, label, or display_name" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_number_errors",
      description: "Recent error events for a specific WhatsApp number. Returns aggregated counts by error_code/message and last 10 raw events.",
      parameters: {
        type: "object",
        properties: {
          whatsapp_number_id: { type: "string", description: "UUID of the number" },
          hours: { type: "number", description: "Lookback window in hours (default 24, max 720)" },
        },
        required: ["whatsapp_number_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_number_stats",
      description: "Sent/delivered/failed/read counts and reply rate for a specific WhatsApp number over a window.",
      parameters: {
        type: "object",
        properties: {
          whatsapp_number_id: { type: "string" },
          hours: { type: "number", description: "Lookback in hours (default 24)" },
        },
        required: ["whatsapp_number_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_status",
      description: "Recent campaigns + lead status counts for a pipeline. Use to understand if a pipeline is healthy.",
      parameters: {
        type: "object",
        properties: {
          pipeline_id: { type: "string" },
          hours: { type: "number", description: "Lookback in hours (default 24)" },
        },
        required: ["pipeline_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_pipelines",
      description: "List pipelines with their workspace and sender numbers. Use to find pipeline_id from a name.",
      parameters: { type: "object", properties: { search: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_workspace_summary",
      description: "Topline numbers for a workspace/client: active numbers, today sent/replied, unread, last activity.",
      parameters: {
        type: "object",
        properties: { workspace_id: { type: "string" } },
        required: ["workspace_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_workspaces",
      description: "List clients (workspaces) with id and name.",
      parameters: { type: "object", properties: { search: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_campaigns",
      description: "Recent campaigns across all workspaces with status, sent vs total, failed.",
      parameters: {
        type: "object",
        properties: {
          hours: { type: "number", description: "Lookback in hours (default 48)" },
          workspace_id: { type: "string", description: "Optional filter" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_health",
      description: "Cron heartbeats, recent webhook events count, last gupshup mail. Use to confirm the system is running.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function runTool(name: string, args: any): Promise<any> {
  const hours = Math.min(Math.max(Number(args?.hours ?? 24), 1), 720);
  const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();

  switch (name) {
    case "list_numbers": {
      let q = adminClient.from("whatsapp_numbers")
        .select("id, phone_number, display_name, label, status, workspace_id, messaging_limit, restricted_at")
        .order("status", { ascending: true });
      const { data } = await q.limit(200);
      const search: string = (args?.search || "").toString().toLowerCase();
      const filtered = !search ? data : (data ?? []).filter((n: any) =>
        [n.phone_number, n.display_name, n.label].some((v) => (v || "").toString().toLowerCase().includes(search))
      );
      // attach workspace name
      const wsIds = [...new Set((filtered ?? []).map((n: any) => n.workspace_id).filter(Boolean))];
      const { data: ws } = await adminClient.from("workspaces").select("id, name").in("id", wsIds.length ? wsIds : ["00000000-0000-0000-0000-000000000000"]);
      const wsMap = new Map((ws ?? []).map((w: any) => [w.id, w.name]));
      return (filtered ?? []).map((n: any) => ({ ...n, workspace_name: wsMap.get(n.workspace_id) ?? null }));
    }
    case "get_number_errors": {
      const { data } = await adminClient.from("whatsapp_message_events")
        .select("event_type, error_code, error_message, received_at")
        .eq("whatsapp_number_id", args.whatsapp_number_id)
        .in("event_type", ["failed", "error"])
        .gte("received_at", sinceIso)
        .order("received_at", { ascending: false })
        .limit(500);
      const agg = new Map<string, number>();
      for (const e of (data ?? [])) {
        const key = `${e.error_code ?? "?"} | ${(e.error_message ?? "").slice(0, 120)}`;
        agg.set(key, (agg.get(key) ?? 0) + 1);
      }
      return {
        window_hours: hours,
        total_errors: data?.length ?? 0,
        by_error: [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ error: k, count: n })),
        recent: (data ?? []).slice(0, 10),
      };
    }
    case "get_number_stats": {
      const { data } = await adminClient.from("whatsapp_message_events")
        .select("event_type, received_at")
        .eq("whatsapp_number_id", args.whatsapp_number_id)
        .gte("received_at", sinceIso)
        .limit(20000);
      const counts: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
      for (const e of (data ?? [])) {
        if (e.event_type === "sent" || e.event_type === "enqueued") counts.sent++;
        else if (e.event_type === "delivered") counts.delivered++;
        else if (e.event_type === "read") counts.read++;
        else if (e.event_type === "failed" || e.event_type === "error") counts.failed++;
      }
      // reply stats via conversations + messages
      const { data: convs } = await adminClient.from("conversations")
        .select("id")
        .eq("whatsapp_number_id", args.whatsapp_number_id);
      const ids = (convs ?? []).map((c: any) => c.id);
      let sent_convos = 0, replied_convos = 0;
      if (ids.length) {
        const { data: msgs } = await adminClient.from("messages")
          .select("conversation_id, direction")
          .in("conversation_id", ids)
          .gte("created_at", sinceIso)
          .limit(50000);
        const map = new Map<string, { out: boolean; in: boolean }>();
        for (const m of (msgs ?? [])) {
          const cur = map.get(m.conversation_id) ?? { out: false, in: false };
          if (m.direction === "outbound") cur.out = true;
          if (m.direction === "inbound") cur.in = true;
          map.set(m.conversation_id, cur);
        }
        for (const v of map.values()) {
          if (v.out) sent_convos++;
          if (v.out && v.in) replied_convos++;
        }
      }
      return {
        window_hours: hours,
        ...counts,
        delivery_pct: counts.sent ? Math.round(counts.delivered / counts.sent * 100) : 0,
        fail_pct: (counts.sent + counts.failed) ? Math.round(counts.failed / (counts.sent + counts.failed) * 100) : 0,
        sent_chats: sent_convos,
        replied_chats: replied_convos,
        reply_pct: sent_convos ? Math.round(replied_convos / sent_convos * 100) : 0,
      };
    }
    case "list_pipelines": {
      const { data } = await adminClient.from("pipelines")
        .select("id, name, workspace_id, auto_outreach_enabled, default_sender_number_ids, slack_channel_id")
        .order("name");
      const search = (args?.search || "").toString().toLowerCase();
      const filtered = !search ? data : (data ?? []).filter((p: any) => (p.name ?? "").toLowerCase().includes(search));
      return filtered;
    }
    case "get_pipeline_status": {
      const { data: leads } = await adminClient.from("lead_imports")
        .select("status")
        .eq("pipeline_id", args.pipeline_id)
        .gte("imported_at", sinceIso);
      const counts: Record<string, number> = {};
      for (const l of (leads ?? [])) counts[l.status] = (counts[l.status] ?? 0) + 1;
      const { data: campaigns } = await adminClient.from("campaigns")
        .select("id, name, status, total_recipients, sent_count, failed_count, created_at")
        .eq("pipeline_id", args.pipeline_id)
        .order("created_at", { ascending: false })
        .limit(10);
      return { window_hours: hours, lead_status: counts, recent_campaigns: campaigns ?? [] };
    }
    case "list_workspaces": {
      const { data } = await adminClient.from("workspaces").select("id, name, slug, internal_code").order("name");
      const search = (args?.search || "").toString().toLowerCase();
      return !search ? data : (data ?? []).filter((w: any) => (w.name ?? "").toLowerCase().includes(search));
    }
    case "get_workspace_summary": {
      const { data: nums } = await adminClient.from("whatsapp_numbers")
        .select("id, status").eq("workspace_id", args.workspace_id);
      const active = (nums ?? []).filter((n: any) => n.status === "active").length;
      const todayIso = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count: deliv } = await adminClient.from("whatsapp_message_events")
        .select("id", { count: "exact", head: true })
        .gte("received_at", todayIso)
        .eq("event_type", "delivered")
        .in("whatsapp_number_id", (nums ?? []).map((n: any) => n.id).slice(0, 1000));
      const { data: convs } = await adminClient.from("conversations")
        .select("id, unread_count, last_message_at")
        .eq("workspace_id", args.workspace_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(500);
      const unread = (convs ?? []).reduce((s: number, c: any) => s + (c.unread_count ?? 0), 0);
      return {
        active_numbers: active,
        total_numbers: nums?.length ?? 0,
        delivered_24h: deliv ?? 0,
        unread_replies: unread,
        last_activity: convs?.[0]?.last_message_at ?? null,
      };
    }
    case "get_recent_campaigns": {
      let q = adminClient.from("campaigns")
        .select("id, name, status, total_recipients, sent_count, failed_count, created_at, workspace_id, pipeline_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(50);
      if (args?.workspace_id) q = q.eq("workspace_id", args.workspace_id);
      const { data } = await q;
      return data ?? [];
    }
    case "get_system_health": {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count: webhookEvents } = await adminClient.from("whatsapp_message_events")
        .select("id", { count: "exact", head: true }).gte("received_at", since);
      const { data: snap } = await adminClient.from("fleet_health_snapshots").select("captured_at, summary").limit(1);
      const { data: mail } = await adminClient.from("gupshup_mail_state").select("last_run_at, last_error").limit(1);
      return {
        webhook_events_last_hour: webhookEvents ?? 0,
        fleet_snapshot_at: snap?.[0]?.captured_at ?? null,
        gupshup_mail_last_run: mail?.[0]?.last_run_at ?? null,
        gupshup_mail_last_error: mail?.[0]?.last_error ?? null,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await userClient.auth.getUser();
  return data.user?.email === ADMIN_EMAIL;
}

const SYSTEM_PROMPT = `You are the Iskra Ops Assistant — an internal helper for the Iskra admin (WhatsApp outreach platform).

You have read-only tools to inspect the live database: numbers, errors, pipelines, campaigns, workspaces (clients), and system health.

Rules:
- Be concise and operational. The admin wants quick answers, not essays.
- ALWAYS use tools to fetch real data — never invent numbers, statuses, or IDs.
- When the user references a number ("01Ashik02", "Nitish", "+91..."), call list_numbers first to resolve the UUID.
- When they reference a client/pipeline by name, call list_workspaces / list_pipelines first.
- Default lookback is 24 hours unless the user says otherwise.
- Surface anomalies (high fail %, restricted numbers, stalled crons) proactively.
- Format numbers with thousands separators and percentages where useful.
- Reply in the same language the user wrote in (Russian or English).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!(await isAdmin(req))) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    // Up to 6 tool-calling rounds
    for (let i = 0; i < 6; i++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: convo,
          tools,
        }),
      });

      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Top up in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("AI gateway error", resp.status, txt);
        return new Response(JSON.stringify({ error: `AI error ${resp.status}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const json = await resp.json();
      const choice = json.choices?.[0];
      const msg = choice?.message;
      if (!msg) {
        return new Response(JSON.stringify({ error: "Empty AI response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (msg.tool_calls?.length) {
        convo.push(msg);
        for (const call of msg.tool_calls) {
          let parsed: any = {};
          try { parsed = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
          let result: any;
          try {
            result = await runTool(call.function.name, parsed);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }
          convo.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result).slice(0, 12000),
          });
        }
        continue;
      }

      // Final answer
      return new Response(JSON.stringify({ reply: msg.content ?? "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: "Reached tool-call limit. Please rephrase your question." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ops-assistant error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

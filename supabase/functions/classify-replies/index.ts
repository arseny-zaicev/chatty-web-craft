// Batch classifier: tags conversations with reply sentiment + intent using Lovable AI.
// Picks conversations that have inbound messages and no insight row yet (or stale).
// Designed to be called from cron-heartbeat / pg_cron every ~15 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

const SCHEMA = {
  type: "object",
  properties: {
    reply_sentiment: { type: "string", enum: ["positive", "neutral", "negative", "objection", "not_interested", "ooo"] },
    reply_intent: { type: "string", enum: ["meeting", "pricing", "info", "wrong_person", "unsubscribe", "spam", "other"] },
    summary: { type: "string", description: "One-sentence summary of what the prospect said." },
  },
  required: ["reply_sentiment", "reply_intent", "summary"],
  additionalProperties: false,
};

async function classify(messages: { direction: string; body: string | null }[]): Promise<{
  reply_sentiment: string;
  reply_intent: string;
  summary: string;
} | null> {
  const transcript = messages
    .filter((m) => m.body)
    .map((m) => `${m.direction === "inbound" ? "PROSPECT" : "AGENT"}: ${m.body}`)
    .join("\n");
  if (!transcript) return null;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You classify B2B WhatsApp outreach replies. Return strict JSON. Sentiment: positive=interested/asks for more; objection=pushes back but engaged; not_interested=clear no; negative=hostile; ooo=auto-reply/away; neutral otherwise. Intent: meeting=wants call/demo; pricing=asks cost; info=asks general info; wrong_person=not them; unsubscribe=asks to stop; spam=marks as spam; other.",
        },
        { role: "user", content: `Transcript:\n${transcript}\n\nClassify the prospect's reply.` },
      ],
      tools: [{ type: "function", function: { name: "classify", parameters: SCHEMA } }],
      tool_choice: { type: "function", function: { name: "classify" } },
    }),
  });

  if (!resp.ok) {
    console.error("classify failed", resp.status, await resp.text());
    return null;
  }
  const j = await resp.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}

Deno.serve(cronGuard({ jobName: "classify-replies", lock: true }, async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body?.limit) || 50, 200);
  const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : null;

  let toProcess: { id: string; workspace_id: string; contact_phone: string | null }[] = [];

  if (campaignId) {
    // Targeted: tag every conversation linked to this campaign that isn't tagged yet.
    const { data: recips } = await admin
      .from("campaign_recipients")
      .select("conversation_id")
      .eq("campaign_id", campaignId)
      .not("conversation_id", "is", null);
    const ids = (recips || []).map((r) => r.conversation_id).filter(Boolean) as string[];
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: tagged } = await admin
      .from("conversation_insights")
      .select("conversation_id")
      .in("conversation_id", ids);
    const taggedSet = new Set((tagged || []).map((t) => t.conversation_id));
    const { data: convs } = await admin
      .from("conversations")
      .select("id, workspace_id, contact_phone")
      .in("id", ids.filter((id) => !taggedSet.has(id)));
    toProcess = ((convs || []) as any[]).slice(0, limit);
  } else {
    // Default backlog: only conversations that already received an inbound message
    // and don't have an insight row yet. This avoids burning the AI budget on
    // outbound-only campaign sends that never replied.
    const { data, error } = await admin.rpc("pending_classification_conversations", { _limit: limit });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    toProcess = (data || []) as any[];
  }

  let processed = 0;
  for (const c of toProcess) {
    const { data: msgs } = await admin
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const inbound = (msgs || []).filter((m) => m.direction === "inbound");
    if (!inbound.length) continue;

    const firstInbound = inbound[0];
    const firstOutbound = (msgs || []).find((m) => m.direction === "outbound");
    const ttfr =
      firstOutbound && firstInbound
        ? Math.max(
            0,
            Math.round(
              (new Date(firstInbound.created_at).getTime() - new Date(firstOutbound.created_at).getTime()) / 1000,
            ),
          )
        : null;

    const tag = await classify(msgs || []);
    if (!tag) continue;

    await admin.from("conversation_insights").upsert({
      conversation_id: c.id,
      workspace_id: c.workspace_id,
      reply_sentiment: tag.reply_sentiment,
      reply_intent: tag.reply_intent,
      summary: tag.summary,
      first_reply_text: firstInbound.body,
      first_reply_at: firstInbound.created_at,
      time_to_first_reply_seconds: ttfr,
      model: "google/gemini-2.5-flash",
      tagged_at: new Date().toISOString(),
      tagged_by: "ai",
    });
    processed += 1;
  }

  return new Response(JSON.stringify({ ok: true, processed, scanned: toProcess.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));

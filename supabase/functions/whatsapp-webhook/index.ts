import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function normalizePhone(p: string): string {
  return (p || "").toString().replace(/[^\d]/g, "");
}

async function handleInbound(payload: Record<string, unknown>) {
  console.log("Inbound payload:", JSON.stringify(payload));
  const inner = (payload.payload ?? {}) as Record<string, unknown>;
  const sender = (inner.sender ?? {}) as Record<string, unknown>;
  const msgPayload = (inner.payload ?? {}) as Record<string, unknown>;
  const appName = String(payload.app ?? inner.app ?? "").trim();
  const destination = normalizePhone(String(
    inner.destination ?? payload.destination ?? ""
  ));
  const source = normalizePhone(String(inner.source ?? sender.phone ?? payload.source ?? ""));
  if (!source) {
    console.warn("Missing source", { destination, source });
    return;
  }

  // Deterministic match order:
  //   1. provider_app_id == Gupshup app name (the only stable, unique identifier we control)
  //   2. phone_number == webhook destination (when provider_app_id is missing on the row)
  // We never match by display_name: it is human-editable, often duplicated across numbers,
  // and was the source of silent misrouting at >1 number.
  let number: { id: string; user_id: string; workspace_id: string; phone_number: string; display_name: string | null; provider_app_id: string | null } | null = null;
  let matchStrategy: "provider_app_id" | "label" | "phone_number" | null = null;
  let ambiguousReason: string | null = null;

  if (appName) {
    const { data, error } = await supabase
      .from("whatsapp_numbers")
      .select("id, user_id, workspace_id, phone_number, display_name, provider_app_id")
      .eq("provider_app_id", appName)
      .limit(2);
    if (error) {
      console.error("provider_app_id lookup failed", error);
    } else if (data && data.length === 1) {
      number = data[0];
      matchStrategy = "provider_app_id";
    } else if (data && data.length > 1) {
      ambiguousReason = `ambiguous_provider_app_id:${data.length}`;
      console.error("Ambiguous provider_app_id - multiple numbers share the same Gupshup app id", { appName, count: data.length });
    }
  }
  // Fallback: provider_app_id stores the Gupshup app UUID, but the webhook payload
  // sends the Gupshup app *name*, which we mirror in the `label` column on creation.
  if (!number && appName) {
    const { data, error } = await supabase
      .from("whatsapp_numbers")
      .select("id, user_id, workspace_id, phone_number, display_name, provider_app_id")
      .eq("label", appName)
      .limit(2);
    if (error) {
      console.error("label lookup failed", error);
    } else if (data && data.length === 1) {
      number = data[0];
      matchStrategy = "label";
    } else if (data && data.length > 1) {
      ambiguousReason = `ambiguous_label:${data.length}`;
      console.error("Ambiguous label - multiple numbers share the same Gupshup app name", { appName, count: data.length });
    }
  }
  if (!number && destination) {
    const { data, error } = await supabase
      .from("whatsapp_numbers")
      .select("id, user_id, workspace_id, phone_number, display_name, provider_app_id")
      .eq("phone_number", destination)
      .limit(2);
    if (error) {
      console.error("phone_number lookup failed", error);
    } else if (data && data.length === 1) {
      number = data[0];
      matchStrategy = "phone_number";
    } else if (data && data.length > 1) {
      ambiguousReason = `ambiguous_phone_number:${data.length}`;
      console.error("Ambiguous phone_number - duplicate rows for same number", { destination, count: data.length });
    }
  }
  if (!number) {
    const reason = ambiguousReason ?? "no_match";
    console.warn("No matching whatsapp_number for inbound webhook", { reason, appName, destination, source });
    await supabase.from("whatsapp_webhook_failures").insert({
      reason,
      app_name: appName || null,
      destination: destination || null,
      source: source || null,
      event_type: "message",
      payload,
      replay_status: "pending",
    });
    return;
  }
  console.log("Matched inbound whatsapp_number", {
    matchStrategy,
    appName,
    destination,
    source,
    whatsapp_number_id: number.id,
    phone_number: number.phone_number,
    display_name: number.display_name,
    provider_app_id: number.provider_app_id,
  });

  const contactName = (sender.name as string) ?? null;
  const messageType = (inner.type as string) ?? "text";
  const body =
    (msgPayload.text as string) ??
    (msgPayload.caption as string) ??
    (msgPayload.title as string) ??
    null;
  const mediaUrl = (msgPayload.url as string) ?? null;
  const providerMessageId = (inner.id as string) ?? null;

  // Upsert conversation
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("whatsapp_number_id", number.id)
    .eq("contact_phone", source)
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    conversationId = existing.id;
    await supabase
      .from("conversations")
      .update({
        contact_name: contactName,
        last_message_text: body ?? `[${messageType}]`,
        last_message_at: new Date().toISOString(),
        unread_count: (existing.unread_count ?? 0) + 1,
      })
      .eq("id", conversationId);
  } else {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        user_id: number.user_id,
        workspace_id: number.workspace_id,
        whatsapp_number_id: number.id,
        contact_phone: source,
        contact_name: contactName,
        last_message_text: body ?? `[${messageType}]`,
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("Failed to create conversation", error);
      return;
    }
    conversationId = created.id;
  }

  // Try to link this reply back to a campaign recipient (most recent sent/delivered to this contact on this number)
  const { data: recipient } = await supabase
    .from("campaign_recipients")
    .select("id, campaign_id, status")
    .eq("whatsapp_number_id", number.id)
    .eq("contact_phone", source)
    .in("status", ["sent", "scheduled", "sending", "pending"])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (recipient) {
    await supabase
      .from("campaign_recipients")
      .update({ status: "replied", conversation_id: conversationId })
      .eq("id", recipient.id);
    console.log("Linked inbound reply to campaign_recipient", recipient.id);
  }

  // Insert message
  await supabase.from("messages").insert({
    user_id: number.user_id,
    conversation_id: conversationId,
    direction: "inbound",
    body,
    media_url: mediaUrl,
    media_type: mediaUrl ? messageType : null,
    status: "delivered",
    provider_message_id: providerMessageId,
    metadata: {
      ...(payload as Record<string, unknown>),
      matched_whatsapp_number: {
        id: number.id,
        phone_number: number.phone_number,
        display_name: number.display_name,
        provider_app_id: number.provider_app_id,
        app_name: appName || null,
        destination: destination || null,
      },
      campaign_recipient_id: recipient?.id ?? null,
      campaign_id: recipient?.campaign_id ?? null,
    },
  });

  // Apply automations: inbound_any + inbound_keyword + button_click
  const triggers: string[] = ["inbound_any"];
  const buttonReply = (msgPayload.id as string) ?? (msgPayload.postbackText as string) ?? null;
  if (messageType === "button_reply" || messageType === "quick_reply" || buttonReply) {
    triggers.push("button_click");
  }

  // Resolve current conversation pipeline so automations remap to the right pipeline.
  const { data: convPipeline } = await supabase
    .from("conversations")
    .select("pipeline_id")
    .eq("id", conversationId)
    .maybeSingle();
  const conversationPipelineId = convPipeline?.pipeline_id ?? null;

  const { data: automations } = await supabase
    .from("stage_automations")
    .select("trigger, trigger_value, target_stage_id")
    .eq("user_id", number.user_id)
    .eq("is_active", true);

  let movedToStageId: string | null = null;

  // Cache of stage rows we've fetched while remapping cross-pipeline targets.
  const stageCache = new Map<string, { id: string; name: string; pipeline_id: string | null; stage_type: string | null }>();
  async function loadStage(id: string) {
    if (stageCache.has(id)) return stageCache.get(id)!;
    const { data } = await supabase
      .from("pipeline_stages")
      .select("id, name, pipeline_id, stage_type")
      .eq("id", id)
      .maybeSingle();
    if (data) stageCache.set(id, data as any);
    return data as any;
  }
  // Resolve target stage to one inside the conversation's pipeline (by name match, fallback to stage_type).
  async function resolveTargetStage(rawTargetId: string): Promise<string | null> {
    const target = await loadStage(rawTargetId);
    if (!target) return null;
    if (!conversationPipelineId || target.pipeline_id === conversationPipelineId) return target.id;
    // Try by name within conversation pipeline.
    const { data: byName } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", conversationPipelineId)
      .ilike("name", target.name ?? "")
      .maybeSingle();
    if (byName?.id) return byName.id;
    // Fallback to stage_type match within conversation pipeline.
    if (target.stage_type) {
      const { data: byType } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", conversationPipelineId)
        .eq("stage_type", target.stage_type)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (byType?.id) return byType.id;
    }
    return null;
  }

  if (automations && automations.length > 0) {
    const lowered = (body ?? "").toLowerCase();
    const loweredButton = (buttonReply ?? "").toLowerCase();
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matchKeyword = (kw: string) => {
      const k = kw.trim().toLowerCase();
      if (!k) return false;
      if (/^[\p{L}\p{N}_]+$/u.test(k)) {
        const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(k)}([^\\p{L}\\p{N}_]|$)`, "u");
        return re.test(lowered);
      }
      return lowered.includes(k);
    };
    for (const a of automations) {
      let match = false;
      if (a.trigger === "inbound_any") match = true;
      else if (a.trigger === "button_click" && triggers.includes("button_click")) {
        if (!a.trigger_value) match = true;
        else {
          const variants = a.trigger_value.split("|").map((v) => v.trim().toLowerCase()).filter(Boolean);
          match = variants.some((v) => v === loweredButton || v === (body ?? "").toLowerCase());
        }
      } else if (a.trigger === "inbound_keyword" && a.trigger_value) {
        const keywords = a.trigger_value.split("|");
        match = keywords.some(matchKeyword);
      }
      if (match) {
        const resolvedStageId = await resolveTargetStage(a.target_stage_id);
        if (!resolvedStageId) {
          console.warn("Skip automation: target stage not in conversation pipeline", { automation_target: a.target_stage_id, conversation_pipeline: conversationPipelineId });
          continue;
        }
        await supabase
          .from("deals")
          .update({ stage_id: resolvedStageId })
          .eq("conversation_id", conversationId);
        movedToStageId = resolvedStageId;
      }
    }
  }

  // Positive reply Slack alert: if automation moved this conversation to a "positive"-named stage,
  // enqueue a positive_lead Slack event (deduped per 24h per conversation).
  if (movedToStageId) {
    const stage = await loadStage(movedToStageId);
    const stageName = (stage?.name ?? "").toLowerCase();
    const isPositive = /positive|interested|booked|hot lead/.test(stageName);
    if (isPositive) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, last_auto_positive_alert_at, pipeline_id")
        .eq("id", conversationId)
        .maybeSingle();
      const last = conv?.last_auto_positive_alert_at ? new Date(conv.last_auto_positive_alert_at).getTime() : 0;
      const dedupeMs = 24 * 60 * 60 * 1000;
      if (Date.now() - last > dedupeMs) {
        // Pull pipeline slack channel so positive alert lands in the right channel.
        let pipelineSlack: string | null = null;
        let pipelineName: string | null = null;
        if (conv?.pipeline_id) {
          const { data: pipe } = await supabase
            .from("pipelines")
            .select("name, slack_channel_id")
            .eq("id", conv.pipeline_id)
            .maybeSingle();
          pipelineSlack = (pipe?.slack_channel_id as string) ?? null;
          pipelineName = (pipe?.name as string) ?? null;
        }
        await supabase.from("slack_event_queue").insert({
          event_type: "positive_lead",
          workspace_id: number.workspace_id,
          payload: {
            conversation_id: conversationId,
            contact_phone: source,
            contact_name: contactName,
            last_message_text: body ?? `[${messageType}]`,
            whatsapp_number_id: number.id,
            stage_name: stage?.name ?? null,
            pipeline_id: conv?.pipeline_id ?? null,
            pipeline_name: pipelineName,
            slack_channel_id: pipelineSlack,
            source: "automation",
          },
        });
        await supabase
          .from("conversations")
          .update({ last_auto_positive_alert_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    }
  }
}
}

async function handleStatus(payload: Record<string, unknown>) {
  const inner = (payload.payload ?? {}) as Record<string, unknown>;
  // Gupshup status payloads: type at top level may be "message-event"; the actual
  // event name (sent/enqueued/delivered/read/failed/deleted) sits in payload.type.
  const innerType = (inner.type as string) ?? null;
  const topType = (payload.type as string) ?? null;
  const eventType = (innerType ?? topType ?? "").toLowerCase();
  const providerMessageId =
    (inner.gsId as string) ??
    (inner.id as string) ??
    ((payload.payload as Record<string, unknown>)?.id as string) ??
    null;

  const map: Record<string, "queued" | "sent" | "delivered" | "read" | "failed" | "deleted"> = {
    sent: "sent",
    enqueued: "queued",
    queued: "queued",
    delivered: "delivered",
    read: "read",
    failed: "failed",
    error: "failed",
    deleted: "deleted",
  };
  const mapped = map[eventType];

  // Look up message + recipient (if any) so we can backfill links on the event row.
  let messageRow: { id: string; user_id: string; conversation_id: string } | null = null;
  let convRow: { workspace_id: string; whatsapp_number_id: string } | null = null;
  let recipientId: string | null = null;
  if (providerMessageId) {
    const { data: m } = await supabase
      .from("messages")
      .select("id, user_id, conversation_id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    messageRow = m ?? null;
    if (messageRow) {
      const { data: c } = await supabase
        .from("conversations")
        .select("workspace_id, whatsapp_number_id")
        .eq("id", messageRow.conversation_id)
        .maybeSingle();
      convRow = c ?? null;
    }
    const { data: r } = await supabase
      .from("campaign_recipients")
      .select("id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    recipientId = r?.id ?? null;
  }

  // Extract provider error if present (Gupshup uses payload.payload.code / reason).
  const errPayload = (inner.payload ?? {}) as Record<string, unknown>;
  const errorCode =
    (errPayload.code as string | number | undefined)?.toString() ??
    (inner.code as string | number | undefined)?.toString() ??
    null;
  const errorMessage =
    (errPayload.reason as string) ??
    (errPayload.message as string) ??
    (inner.reason as string) ??
    null;

  // Always persist the raw event for forensic visibility.
  await supabase.from("whatsapp_message_events").insert({
    event_type: eventType || "unknown",
    provider_message_id: providerMessageId,
    workspace_id: convRow?.workspace_id ?? null,
    whatsapp_number_id: convRow?.whatsapp_number_id ?? null,
    message_id: messageRow?.id ?? null,
    campaign_recipient_id: recipientId,
    error_code: errorCode,
    error_message: errorMessage,
    raw: payload,
  });

  if (mapped && messageRow) {
    await supabase
      .from("messages")
      .update({ status: mapped })
      .eq("id", messageRow.id);
  }

  // Propagate terminal states to the campaign recipient too.
  if (recipientId && (mapped === "failed" || mapped === "delivered" || mapped === "sent")) {
    const recipientStatus = mapped === "failed" ? "failed" : "sent";
    await supabase
      .from("campaign_recipients")
      .update({ status: recipientStatus, error_message: errorMessage ?? undefined })
      .eq("id", recipientId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const type = (payload.type as string) ?? "";
    console.log("Gupshup webhook event", type);

    if (type === "message") {
      await handleInbound(payload);
    } else if (type === "message-event" || type === "user-event") {
      await handleStatus(payload);
    } else {
      console.log("Unhandled type", type, JSON.stringify(payload).slice(0, 500));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("Webhook error", msg);
    // Return 200 anyway so Gupshup doesn't keep retrying on parse errors
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

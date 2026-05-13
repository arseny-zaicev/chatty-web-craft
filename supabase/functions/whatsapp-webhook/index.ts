import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateBody } from "../_shared/template.ts";

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

function compactStrings(values: unknown[]): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

function expectedPrefixesForCountry(country: string | null | undefined): string[] {
  const c = String(country ?? "").trim().toLowerCase();
  if (!c) return [];
  if (["uk", "gb", "great britain", "united kingdom", "england", "scotland", "wales"].includes(c)) return ["44"];
  if (["india", "in"].includes(c)) return ["91"];
  if (["us", "usa", "united states", "united states of america"].includes(c)) return ["1"];
  if (["greece", "gr"].includes(c)) return ["30"];
  if (["malta", "mt"].includes(c)) return ["356"];
  return [];
}

async function phoneMatchesRecentPipelineCountry(pipelineId: string | null, phone: string): Promise<boolean> {
  if (!pipelineId) return true;
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("recipient_country")
    .eq("pipeline_id", pipelineId)
    .not("recipient_country", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prefixes = expectedPrefixesForCountry((campaign as any)?.recipient_country);
  return prefixes.length === 0 || prefixes.some((prefix) => phone.startsWith(prefix));
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
    // Resolve pipeline from the most recent first_touch campaign recipient for this
    // (number, phone), so the new conversation lands in the source pipeline rather
    // than the workspace default that the BEFORE INSERT trigger would otherwise set.
    let inferredPipelineId: string | null = null;
    const { data: rec } = await supabase
      .from("campaign_recipients")
      .select("campaigns!inner(pipeline_id, kind)")
      .eq("whatsapp_number_id", number.id)
      .eq("contact_phone", source)
      .eq("campaigns.kind", "first_touch")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    inferredPipelineId = (rec as any)?.campaigns?.pipeline_id ?? null;

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        user_id: number.user_id,
        workspace_id: number.workspace_id,
        whatsapp_number_id: number.id,
        contact_phone: source,
        contact_name: contactName,
        pipeline_id: inferredPipelineId,
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
    .select("id, campaign_id, status, campaigns!inner(pipeline_id, kind)")
    .eq("whatsapp_number_id", number.id)
    .eq("contact_phone", source)
    .in("status", ["sent", "scheduled", "sending", "pending"])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const recipientPipelineId = (recipient as any)?.campaigns?.pipeline_id ?? null;
  if (recipient) {
    await supabase
      .from("campaign_recipients")
      .update({ status: "replied", conversation_id: conversationId })
      .eq("id", recipient.id);
    if (recipientPipelineId) {
      await supabase
        .from("conversations")
        .update({ pipeline_id: recipientPipelineId })
        .eq("id", conversationId);
      await supabase
        .from("deals")
        .update({ pipeline_id: recipientPipelineId })
        .eq("conversation_id", conversationId);
    }
    console.log("Linked inbound reply to campaign_recipient", recipient.id);
  }

  // If the reply carries WhatsApp/Gupshup context but the opener is missing in our
  // messages table, backfill it from the campaign recipient. This prevents chats
  // from looking like they started with the customer's quick reply when the send
  // row was not inserted or the provider used a different id in the reply context.
  const context = (inner.context ?? {}) as Record<string, unknown>;
  const contextIds = compactStrings([context.gsId, context.id]);
  if (recipient && contextIds.length > 0) {
    const { data: existingContextMessage } = await supabase
      .from("messages")
      .select("id")
      .in("provider_message_id", contextIds)
      .limit(1)
      .maybeSingle();

    if (!existingContextMessage) {
      const { data: opener } = await supabase
        .from("campaign_recipients")
        .select("id, user_id, campaign_id, provider_message_id, sent_at, variables, campaigns!inner(message_templates(id, name, body, variables))")
        .eq("id", recipient.id)
        .maybeSingle();
      const tpl = (opener as any)?.campaigns?.message_templates;
      const variableNames: string[] = Array.isArray(tpl?.variables) ? tpl.variables : [];
      const openerBody = renderTemplateBody(tpl?.body, variableNames, (opener as any)?.variables) || `[Template] ${tpl?.name ?? ""}`.trim();
      const openerProviderId = String((opener as any)?.provider_message_id ?? contextIds[0] ?? "").trim() || null;
      if (openerProviderId && openerBody) {
        await supabase.from("messages").insert({
          user_id: (opener as any)?.user_id ?? number.user_id,
          conversation_id: conversationId,
          direction: "outbound",
          body: openerBody,
          status: "sent",
          provider_message_id: openerProviderId,
          created_at: (opener as any)?.sent_at ?? new Date(Date.now() - 1000).toISOString(),
          metadata: {
            campaign_id: (opener as any)?.campaign_id ?? recipient.campaign_id,
            campaign_recipient_id: recipient.id,
            template_id: tpl?.id ?? null,
            template_name: tpl?.name ?? null,
            source: "campaign_opener_backfill_from_reply_context",
            reply_context_ids: contextIds,
          },
        });
        console.log("Backfilled missing campaign opener from reply context", { conversationId, recipient_id: recipient.id, openerProviderId });
      }
    }
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
  const conversationPipelineId = recipientPipelineId ?? convPipeline?.pipeline_id ?? null;

  // If a sender number gets reused/reassigned, old replies from another country can
  // arrive without a matching campaign_recipient and otherwise fall into the current
  // workspace default pipeline. Keep the chat in Inbox, but remove it from Pipeline
  // and stop automations/Slack when it does not match the pipeline's recent country.
  if (!recipient && !(await phoneMatchesRecentPipelineCountry(conversationPipelineId, source))) {
    await supabase.from("conversations").update({ pipeline_id: null }).eq("id", conversationId);
    await supabase.from("deals").delete().eq("conversation_id", conversationId);
    console.warn("Quarantined cross-country unmatched inbound from pipeline", { conversationId, source, conversationPipelineId });
    return;
  }

  // Scope automations to this workspace AND, when known, the conversation's
  // pipeline. This prevents button replies from triggering moves on unrelated
  // pipelines that share the same operator user_id.
  let autoQuery = supabase
    .from("stage_automations")
    .select("trigger, trigger_value, target_stage_id, workspace_id")
    .eq("user_id", number.user_id)
    .eq("is_active", true);
  if (number.workspace_id) autoQuery = autoQuery.eq("workspace_id", number.workspace_id);
  const { data: automations } = await autoQuery;

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

  // Auto-reply guard: business numbers / IVRs / out-of-office bots often spit
  // marketing blurbs that contain words like "info", "details", "book online".
  // Those tripped the positive-keyword automation and pinged Slack as hot leads.
  // We skip inbound_keyword + inbound_any automations on detected auto-replies,
  // but still allow button_click (genuine prospect intent).
  const loweredFull = (body ?? "").toLowerCase();
  const urlCount = (loweredFull.match(/https?:\/\//g) || []).length;
  const isAutoReply =
    /\bthank you for (contacting|reaching out|your message|getting in touch)\b/.test(loweredFull) ||
    /\bthanks for (messaging|your message|getting in touch)\b/.test(loweredFull) ||
    /\bout of (the )?office\b/.test(loweredFull) ||
    /\boffice hours\b/.test(loweredFull) ||
    /\b(automatic|automated|auto[- ]?)reply\b/.test(loweredFull) ||
    /\bthis is an automated\b/.test(loweredFull) ||
    /\bwe (will|'ll) get back to you\b/.test(loweredFull) ||
    /\bbook online\b/.test(loweredFull) ||
    /\b(booking link|book a table|book classes|book your|booking system|reservations?)\b/.test(loweredFull) ||
    /\bplease leave (us )?a message\b/.test(loweredFull) ||
    /\bemail us at\b/.test(loweredFull) ||
    /\bour whatsapp is\b/.test(loweredFull) ||
    /\bcurrently (away|unavailable|closed)\b/.test(loweredFull) ||
    ((urlCount >= 1 || /\bwww\./.test(loweredFull)) && (loweredFull.length || 0) > 160 && /\b(book|booking|contact|form|timetable|office|reservation|appointment)\b/.test(loweredFull)) ||
    (urlCount >= 2 && (loweredFull.length || 0) > 180);

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
      if (a.trigger === "inbound_any") match = !isAutoReply;
      else if (a.trigger === "button_click" && triggers.includes("button_click")) {
        if (!a.trigger_value) match = true;
        else {
          const variants = a.trigger_value.split("|").map((v) => v.trim().toLowerCase()).filter(Boolean);
          match = variants.some((v) => v === loweredButton || v === (body ?? "").toLowerCase());
        }
      } else if (a.trigger === "inbound_keyword" && a.trigger_value) {
        if (isAutoReply) { match = false; }
        else {
          const keywords = a.trigger_value.split("|");
          match = keywords.some(matchKeyword);
        }
      }
      if (match) {
        const resolvedStageId = await resolveTargetStage(a.target_stage_id);
        if (!resolvedStageId) {
          console.warn("Skip automation: target stage not in conversation pipeline", { automation_target: a.target_stage_id, conversation_pipeline: conversationPipelineId });
          continue;
        }
        await supabase
          .from("deals")
          .update({ stage_id: resolvedStageId, pipeline_id: conversationPipelineId })
          .eq("conversation_id", conversationId);
        movedToStageId = resolvedStageId;
        // If the resolved stage is a lost stage (e.g. Block / Not interested),
        // clear unread on the conversation so it stops pestering the operator.
        const resolved = await loadStage(resolvedStageId);
        if (resolved?.stage_type === "lost") {
          await supabase
            .from("conversations")
            .update({ unread_count: 0 })
            .eq("id", conversationId);
        }
      }
    }
  }

  // Positive reply Slack alert: only fire when the automation moved the conversation
  // to a stage that is unambiguously positive. Previously a substring match treated
  // "Not interested/Block" as positive (because of the word "interested"), spamming
  // the channel on negative quick-replies.
  if (movedToStageId) {
    const stage = await loadStage(movedToStageId);
    const stageName = (stage?.name ?? "").toLowerCase().trim();
    const stageType = (stage as any)?.stage_type ?? "open";
    // Hard exclusions: lost/won stages or names that begin with a negation never count.
    const isNegated = /\b(not|no|never|don't|do not|без)\b/.test(stageName)
      || /\bblock\b/.test(stageName)
      || /\bspam\b/.test(stageName)
      || /\bunsubscribe\b/.test(stageName);
    // Word-bounded match so "interested" inside "not interested" doesn't slip through.
    const positiveHit = /(^|[^a-z])(positive|interested|booked|hot\s*lead|qualified|demo|meeting)([^a-z]|$)/.test(stageName);
    const isPositive = stageType !== "lost" && stageType !== "won" && positiveHit && !isNegated;
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

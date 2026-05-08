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
  const destination = normalizePhone(String(
    inner.destination ?? payload.destination ?? ""
  ));
  const source = normalizePhone(String(inner.source ?? sender.phone ?? payload.source ?? ""));
  if (!source) {
    console.warn("Missing source", { destination, source });
    return;
  }

  // Lookup by destination, OR fallback to single active number when destination is missing
  let number: { id: string; user_id: string; workspace_id: string } | null = null;
  if (destination) {
    const { data } = await supabase
      .from("whatsapp_numbers")
      .select("id, user_id, workspace_id")
      .eq("phone_number", destination)
      .maybeSingle();
    number = data;
  }
  if (!number) {
    const { data: numbers } = await supabase
      .from("whatsapp_numbers")
      .select("id, user_id, workspace_id")
      .eq("is_active", true);
    if (numbers && numbers.length === 1) {
      number = numbers[0];
      console.log("Falling back to single active number", number.id);
    }
  }
  if (!number) {
    console.warn("No matching whatsapp_number for destination", destination);
    return;
  }

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

  const { data: automations } = await supabase
    .from("stage_automations")
    .select("trigger, trigger_value, target_stage_id")
    .eq("user_id", number.user_id)
    .eq("is_active", true);

  if (automations && automations.length > 0) {
    const lowered = (body ?? "").toLowerCase();
    for (const a of automations) {
      let match = false;
      if (a.trigger === "inbound_any") match = true;
      else if (a.trigger === "button_click" && triggers.includes("button_click")) {
        match = !a.trigger_value || a.trigger_value === buttonReply;
      } else if (a.trigger === "inbound_keyword" && a.trigger_value) {
        match = lowered.includes(a.trigger_value.toLowerCase());
      }
      if (match) {
        await supabase
          .from("deals")
          .update({ stage_id: a.target_stage_id })
          .eq("conversation_id", conversationId);
      }
    }
  }
}

async function handleStatus(payload: Record<string, unknown>) {
  const inner = (payload.payload ?? {}) as Record<string, unknown>;
  const providerMessageId = (inner.gsId as string) ?? (inner.id as string) ?? null;
  const status = (payload.type as string) ?? (inner.type as string) ?? null;
  if (!providerMessageId || !status) return;

  const map: Record<string, string> = {
    sent: "sent",
    enqueued: "queued",
    delivered: "delivered",
    read: "read",
    failed: "failed",
    "message-event": status,
  };
  const mapped = map[status] ?? status;
  if (!["queued", "sent", "delivered", "read", "failed"].includes(mapped)) return;

  await supabase
    .from("messages")
    .update({ status: mapped })
    .eq("provider_message_id", providerMessageId);
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

// Reconcile inbound/outbound message state for a workspace using only DB +
// previously persisted webhook events. No external API calls = zero token cost.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Issue = {
  kind: "inbound_missing" | "outbound_status_synced" | "outbound_no_status";
  provider_message_id: string | null;
  contact_phone: string | null;
  whatsapp_number_id: string | null;
  message_id?: string | null;
  conversation_id?: string | null;
  detail?: string | null;
  occurred_at?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return json({ error: "unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspace_id ?? "").trim();
    const hours = Math.max(1, Math.min(168, Number(body?.hours ?? 24)));
    const autoFix = body?.auto_fix !== false; // default true

    if (!workspaceId) return json({ error: "workspace_id required" }, 400);

    // Workspace manager check
    const { data: isMgr } = await admin.rpc("is_workspace_manager", {
      _workspace_id: workspaceId,
      _user_id: userId,
    });
    if (!isMgr) return json({ error: "forbidden" }, 403);

    const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const issues: Issue[] = [];

    // === INBOUND PASS ============================================
    // All inbound webhook receipts for this workspace in window
    const { data: inboundEvents } = await admin
      .from("whatsapp_message_events")
      .select("id, provider_message_id, whatsapp_number_id, raw, received_at")
      .eq("workspace_id", workspaceId)
      .eq("event_type", "inbound_message_received")
      .gte("received_at", sinceIso)
      .order("received_at", { ascending: true })
      .limit(2000);

    const inboundChecked = inboundEvents?.length ?? 0;
    let inboundRecovered = 0;
    let inboundMissing = 0;

    if (inboundEvents && inboundEvents.length > 0) {
      const providerIds = inboundEvents
        .map((e) => e.provider_message_id)
        .filter((x): x is string => Boolean(x));

      const persistedSet = new Set<string>();
      if (providerIds.length > 0) {
        // Chunk in batches of 500
        for (let i = 0; i < providerIds.length; i += 500) {
          const chunk = providerIds.slice(i, i + 500);
          const { data: rows } = await admin
            .from("messages")
            .select("provider_message_id")
            .eq("direction", "inbound")
            .in("provider_message_id", chunk);
          (rows ?? []).forEach((r) => r.provider_message_id && persistedSet.add(r.provider_message_id));
        }
      }

      for (const ev of inboundEvents) {
        if (!ev.provider_message_id) continue;
        if (persistedSet.has(ev.provider_message_id)) continue;
        inboundMissing++;

        if (!autoFix) {
          issues.push({
            kind: "inbound_missing",
            provider_message_id: ev.provider_message_id,
            contact_phone: extractInboundPhone(ev.raw),
            whatsapp_number_id: ev.whatsapp_number_id,
            occurred_at: ev.received_at,
            detail: "Webhook received but message not persisted",
          });
          continue;
        }

        const recovered = await recoverInbound(admin, ev, workspaceId);
        if (recovered.ok) {
          inboundRecovered++;
          issues.push({
            kind: "inbound_missing",
            provider_message_id: ev.provider_message_id,
            contact_phone: recovered.contactPhone,
            whatsapp_number_id: ev.whatsapp_number_id,
            message_id: recovered.messageId,
            conversation_id: recovered.conversationId,
            occurred_at: ev.received_at,
            detail: "Recovered from raw webhook payload",
          });
        } else {
          issues.push({
            kind: "inbound_missing",
            provider_message_id: ev.provider_message_id,
            contact_phone: extractInboundPhone(ev.raw),
            whatsapp_number_id: ev.whatsapp_number_id,
            occurred_at: ev.received_at,
            detail: `Recovery failed: ${recovered.error}`,
          });
        }
      }
    }

    // === OUTBOUND PASS ===========================================
    // Find outbound messages stuck in non-terminal status > 1h old in window
    const stuckUntilIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: stuckMessages } = await admin
      .from("messages")
      .select("id, provider_message_id, status, created_at, conversation_id, conversations!inner(workspace_id, contact_phone, whatsapp_number_id)")
      .eq("direction", "outbound")
      .in("status", ["sent", "queued"])
      .gte("created_at", sinceIso)
      .lt("created_at", stuckUntilIso)
      .eq("conversations.workspace_id", workspaceId)
      .not("provider_message_id", "is", null)
      .limit(2000);

    const outboundChecked = stuckMessages?.length ?? 0;
    let outboundSynced = 0;
    let outboundFailed = 0;

    if (stuckMessages && stuckMessages.length > 0) {
      const stuckIds = stuckMessages.map((m) => m.provider_message_id!).filter(Boolean);

      // Pull any related events with terminal status for these provider_message_ids
      const eventMap = new Map<string, { event_type: string; error_code: string | null; error_message: string | null; received_at: string }>();
      for (let i = 0; i < stuckIds.length; i += 500) {
        const chunk = stuckIds.slice(i, i + 500);
        const { data: evs } = await admin
          .from("whatsapp_message_events")
          .select("provider_message_id, event_type, error_code, error_message, received_at")
          .in("provider_message_id", chunk)
          .in("event_type", ["delivered", "read", "failed", "sent", "message-event"])
          .order("received_at", { ascending: true });
        (evs ?? []).forEach((e) => {
          if (!e.provider_message_id) return;
          const prev = eventMap.get(e.provider_message_id);
          const rank = terminalRank(e.event_type);
          if (!prev || rank > terminalRank(prev.event_type)) {
            eventMap.set(e.provider_message_id, e as any);
          }
        });
      }

      for (const m of stuckMessages) {
        const pid = m.provider_message_id!;
        const ev = eventMap.get(pid);
        const conv: any = (m as any).conversations;
        if (ev) {
          const mapped = mapEventToStatus(ev.event_type);
          if (mapped && mapped !== m.status) {
            await admin.from("messages").update({ status: mapped }).eq("id", m.id);
            // also propagate to campaign_recipients if any
            await admin
              .from("campaign_recipients")
              .update({
                status: mapped === "failed" ? "failed" : mapped === "delivered" ? "delivered" : "sent",
                error_message: ev.error_message,
              })
              .eq("provider_message_id", pid);
            outboundSynced++;
            issues.push({
              kind: "outbound_status_synced",
              provider_message_id: pid,
              contact_phone: conv?.contact_phone ?? null,
              whatsapp_number_id: conv?.whatsapp_number_id ?? null,
              message_id: m.id,
              conversation_id: m.conversation_id,
              occurred_at: ev.received_at,
              detail: `Status synced ${m.status} → ${mapped}`,
            });
          }
        } else {
          // No status update in window at all → mark failed if older than full window
          const ageMs = Date.now() - new Date(m.created_at).getTime();
          if (ageMs > hours * 3600 * 1000 * 0.95 && autoFix) {
            await admin
              .from("messages")
              .update({ status: "failed", metadata: { reconcile_reason: "no_status_update_in_window" } as any })
              .eq("id", m.id);
            await admin
              .from("campaign_recipients")
              .update({ status: "failed", error_message: "no provider status update" })
              .eq("provider_message_id", pid);
            outboundFailed++;
          }
          issues.push({
            kind: "outbound_no_status",
            provider_message_id: pid,
            contact_phone: conv?.contact_phone ?? null,
            whatsapp_number_id: conv?.whatsapp_number_id ?? null,
            message_id: m.id,
            conversation_id: m.conversation_id,
            occurred_at: m.created_at,
            detail: "No provider status update received",
          });
        }
      }
    }

    return json({
      ok: true,
      workspace_id: workspaceId,
      hours,
      auto_fix: autoFix,
      ran_at: new Date().toISOString(),
      inbound: {
        checked: inboundChecked,
        missing: inboundMissing,
        recovered: inboundRecovered,
      },
      outbound: {
        checked: outboundChecked,
        synced: outboundSynced,
        marked_failed: outboundFailed,
      },
      issues,
    });
  } catch (e: any) {
    console.error("reconcile-messages error", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function terminalRank(t: string): number {
  switch (t) {
    case "failed": return 4;
    case "read": return 3;
    case "delivered": return 2;
    case "sent": return 1;
    default: return 0;
  }
}

function mapEventToStatus(t: string): "delivered" | "read" | "failed" | "sent" | null {
  if (t === "delivered") return "delivered";
  if (t === "read") return "read";
  if (t === "failed") return "failed";
  if (t === "sent") return "sent";
  return null;
}

function extractInboundPhone(raw: any): string | null {
  try {
    const sender = raw?.payload?.sender ?? raw?.sender ?? {};
    return (sender.phone as string) ?? (raw?.payload?.source as string) ?? null;
  } catch {
    return null;
  }
}

async function recoverInbound(
  admin: any,
  ev: { id: string; provider_message_id: string | null; whatsapp_number_id: string | null; raw: any; received_at: string },
  workspaceId: string,
): Promise<{ ok: true; messageId: string; conversationId: string; contactPhone: string | null } | { ok: false; error: string }> {
  const raw = ev.raw ?? {};
  const payload = raw?.payload ?? {};
  const inner = payload?.payload ?? {};
  const sender = payload?.sender ?? {};
  const source = (sender.phone as string) ?? (payload?.source as string) ?? null;
  const contactName = (sender.name as string) ?? null;
  const messageType = (inner.type as string) ?? "text";
  const body =
    (inner?.payload?.text as string) ??
    (inner?.payload?.caption as string) ??
    (inner?.text as string) ??
    null;
  const mediaUrl = (inner?.payload?.url as string) ?? null;

  if (!source || !ev.whatsapp_number_id) {
    return { ok: false, error: "missing_source_or_number" };
  }

  // Look up number to get user_id
  const { data: number } = await admin
    .from("whatsapp_numbers")
    .select("id, user_id, workspace_id")
    .eq("id", ev.whatsapp_number_id)
    .maybeSingle();
  if (!number) return { ok: false, error: "number_not_found" };

  // Find or create conversation
  const { data: existing } = await admin
    .from("conversations")
    .select("id, unread_count")
    .eq("whatsapp_number_id", number.id)
    .eq("contact_phone", source)
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    conversationId = existing.id;
    await admin
      .from("conversations")
      .update({
        contact_name: contactName ?? undefined,
        unread_count: (existing.unread_count ?? 0) + 1,
      })
      .eq("id", conversationId);
  } else {
    const { data: created, error: convErr } = await admin
      .from("conversations")
      .insert({
        user_id: number.user_id,
        workspace_id: number.workspace_id ?? workspaceId,
        whatsapp_number_id: number.id,
        contact_phone: source,
        contact_name: contactName,
        unread_count: 1,
      })
      .select("id")
      .single();
    if (convErr || !created) return { ok: false, error: convErr?.message ?? "conv_insert_failed" };
    conversationId = created.id;
  }

  // Insert message (idempotent by unique constraint on inbound provider_message_id)
  const { data: inserted, error: msgErr } = await admin
    .from("messages")
    .insert({
      user_id: number.user_id,
      conversation_id: conversationId,
      direction: "inbound",
      body,
      media_url: mediaUrl,
      media_type: mediaUrl ? messageType : null,
      status: "delivered",
      provider_message_id: ev.provider_message_id,
      created_at: ev.received_at,
      metadata: {
        recovered_by: "reconcile-messages",
        recovered_at: new Date().toISOString(),
        original_event_id: ev.id,
      },
    })
    .select("id")
    .maybeSingle();
  if (msgErr || !inserted) return { ok: false, error: msgErr?.message ?? "insert_failed" };

  // Log recovery event
  await admin.from("whatsapp_message_events").insert({
    event_type: "inbound_message_recovered",
    provider_message_id: ev.provider_message_id,
    workspace_id: workspaceId,
    whatsapp_number_id: ev.whatsapp_number_id,
    message_id: inserted.id,
    raw: { recovered_from_event: ev.id },
  });

  return { ok: true, messageId: inserted.id, conversationId, contactPhone: source };
}

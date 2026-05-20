// Campaign control surface (pause / resume / cancel + kill switch + runtime status).
// Extracted verbatim from campaigns/index.ts (stage 1 split). No behavior change.

import { canAccessUser, json, uuidRegex } from "./_helpers.ts";
import { postSlackChannelMessage } from "./notifications.ts";

// ===== pause / resume / cancel =====
export async function setCampaignStatus(
  admin: any,
  requesterId: string,
  body: any,
  kind: "pause" | "resume" | "cancel",
) {
  const ids: string[] = Array.isArray(body.campaign_ids) ? body.campaign_ids.filter((x: any) => uuidRegex.test(x)) : [];
  if (body.campaign_id && uuidRegex.test(body.campaign_id)) ids.push(body.campaign_id);
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return json({ error: "campaign_id required" }, 400);

  const { data: rows } = await admin.from("campaigns").select("id, user_id, status, first_scheduled_at").in("id", uniq);
  if (!rows || rows.length === 0) return json({ error: "Not found" }, 404);
  for (const r of rows) {
    if (!(await canAccessUser(admin, requesterId, r.user_id))) return json({ error: "Forbidden" }, 403);
  }

  const updates: Record<string, string[]> = {};
  for (const r of rows) {
    let next: string;
    if (kind === "pause") next = "paused";
    else if (kind === "cancel") next = "cancelled";
    else {
      // resume: scheduled if first send is in future (>2m), else running
      const firstMs = r.first_scheduled_at ? new Date(r.first_scheduled_at).getTime() : 0;
      next = firstMs > Date.now() + 120_000 ? "scheduled" : "running";
    }
    (updates[next] ||= []).push(r.id);
  }
  for (const [status, list] of Object.entries(updates)) {
    const { error } = await admin.from("campaigns").update({ status }).in("id", list);
    if (error) return json({ error: error.message }, 500);
  }
  // On cancel: release audience rows reserved/marked-used for these campaigns back into the pool.
  if (kind === "cancel") {
    const cancelled = updates["cancelled"] ?? [];
    if (cancelled.length > 0) {
      await admin
        .from("audience_rows")
        .update({ usage_status: "unused", reserved_at: null, used_at: null, used_in_campaign_id: null })
        .in("used_in_campaign_id", cancelled);
    }
  }
  // Slack: notify on pause / cancel so ops sees state changes that today only live in DB.
  if (kind === "pause" || kind === "cancel") {
    try {
      const paused = updates[kind === "pause" ? "paused" : "cancelled"] ?? [];
      if (paused.length > 0) {
        const { data: detail } = await admin
          .from("campaigns")
          .select("id, name, workspace_id, total_recipients, workspaces(slack_channel_id, name)")
          .in("id", paused);
        // Canonical alltime sent at the moment of pause/cancel.
        const truthById = new Map<string, number>();
        try {
          const { data: t } = await admin.rpc("campaign_metrics_for_range", {
            p_campaign_ids: paused,
            _from: "1970-01-01T00:00:00Z",
            _to: new Date().toISOString(),
          });
          for (const row of (t ?? []) as Array<{ campaign_id: string; sent: number }>) {
            truthById.set(row.campaign_id, row.sent ?? 0);
          }
        } catch { /* ignore */ }
        const verb = kind === "pause" ? "paused" : "cancelled";
        const emoji = kind === "pause" ? "⏸️" : "🛑";
        const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;
        for (const c of detail ?? []) {
          const sent = truthById.get(c.id) ?? 0;
          const total = c.total_recipients ?? 0;
          const remaining = Math.max(0, total - sent);
          const text = `${emoji} *Campaign ${verb}*: ${c.name}\n• Sent: *${sent}* / ${total}  (remaining: ${remaining})${reason ? `\n• Reason: ${reason}` : ""}`;
          const channel = (c as any).workspaces?.slack_channel_id || "#delivery-campaigns";
          // Fire-and-forget; never blocks the response.
          postSlackChannelMessage(channel, text);
          // Mirror to ops queue for digest/log retention.
          admin.from("slack_event_queue").insert({
            event_type: kind === "pause" ? "campaign_paused" : "campaign_cancelled",
            workspace_id: c.workspace_id,
            payload: { text, campaign_name: c.name, campaign_id: c.id, sent, total, reason },
          }).then(() => {}, () => {});
        }
      }
    } catch (e) {
      console.error("pause/cancel slack notify failed", e);
    }
  }
  return json({ ok: true, action: kind, campaigns: uniq.length });
}

// ===== Engage / release a kill switch. scope: campaign | sender | instant_mode_global. =====
export async function killSwitch(admin: any, requesterId: string, body: any) {
  const scope = String(body.scope || "campaign");
  const reason = String(body.reason || "manual").slice(0, 500);
  const release = body.release === true;

  if (scope === "campaign") {
    const id = String(body.campaign_id || "");
    if (!uuidRegex.test(id)) return json({ error: "campaign_id required" }, 400);
    const { data: c } = await admin.from("campaigns").select("id, user_id, workspace_id").eq("id", id).maybeSingle();
    if (!c) return json({ error: "Not found" }, 404);
    if (!(await canAccessUser(admin, requesterId, c.user_id))) return json({ error: "Forbidden" }, 403);
    await admin.from("campaigns").update({
      kill_switch_at: release ? null : new Date().toISOString(),
      kill_switch_by: release ? null : requesterId,
      kill_switch_reason: release ? null : reason,
      status: release ? "running" : "paused",
    }).eq("id", id);
    await admin.from("campaign_dispatch_events").insert({
      campaign_id: id, workspace_id: c.workspace_id,
      event_type: release ? "kill_switch_released" : "killed",
      reason, payload: { by: requesterId },
    });
    return json({ ok: true });
  }

  if (scope === "sender") {
    const id = String(body.whatsapp_number_id || "");
    if (!uuidRegex.test(id)) return json({ error: "whatsapp_number_id required" }, 400);
    const { data: n } = await admin.from("whatsapp_numbers").select("id, user_id").eq("id", id).maybeSingle();
    if (!n) return json({ error: "Not found" }, 404);
    if (!(await canAccessUser(admin, requesterId, n.user_id))) return json({ error: "Forbidden" }, 403);
    await admin.from("whatsapp_numbers").update({
      paused_at: release ? null : new Date().toISOString(),
      paused_reason: release ? null : reason,
    }).eq("id", id);
    return json({ ok: true });
  }

  if (scope === "instant_mode_global") {
    const { data: isAdminRow } = await admin.rpc("is_admin", { _user_id: requesterId });
    if (!isAdminRow) return json({ error: "Admin only" }, 403);
    await admin.from("system_flags").upsert({
      key: "marketing_instant_enabled",
      value: release ? true : false,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown scope" }, 400);
}

// ===== Live runtime status for the operator UI =====
export async function runtimeStatus(admin: any, requesterId: string, body: any) {
  const id = String(body.campaign_id || "");
  if (!uuidRegex.test(id)) return json({ error: "campaign_id required" }, 400);
  const { data: c } = await admin.from("campaigns")
    .select("id, user_id, workspace_id, status, dispatch_mode, kill_switch_at, kill_switch_reason, prepared_at, prepared_expires_at, prepared_signature, prepared_report, max_inflight_per_number, max_inflight_per_campaign")
    .eq("id", id).maybeSingle();
  if (!c) return json({ error: "Not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, c.user_id))) return json({ error: "Forbidden" }, 403);

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const fiveMinIso = new Date(Date.now() - 5 * 60_000).toISOString();

  const { data: recents } = await admin
    .from("campaign_recipients")
    .select("whatsapp_number_id, status, sent_at")
    .eq("campaign_id", id)
    .gte("sent_at", sinceIso)
    .not("sent_at", "is", null)
    .limit(2000);
  const sentLast60 = (recents ?? []).length;
  const activeSenders = new Set((recents ?? []).map((r: any) => r.whatsapp_number_id).filter(Boolean));

  const { data: events } = await admin
    .from("campaign_dispatch_events")
    .select("whatsapp_number_id, event_type, reason, created_at")
    .eq("campaign_id", id)
    .gte("created_at", fiveMinIso)
    .order("created_at", { ascending: false })
    .limit(500);

  const idleByNum = new Map<string, { reason: string; at: string }>();
  for (const e of events ?? []) {
    const nid = (e as any).whatsapp_number_id;
    if (!nid || idleByNum.has(nid) || activeSenders.has(nid)) continue;
    idleByNum.set(nid, { reason: e.reason ?? e.event_type, at: e.created_at });
  }

  // Pool participation alert: window open + < 50% selected senders sent in last 5 min.
  const selected = (c.prepared_report as any)?.numbers?.map((n: any) => n.id) ?? [];
  const { data: recentByNum } = await admin
    .from("campaign_recipients")
    .select("whatsapp_number_id")
    .eq("campaign_id", id)
    .gte("sent_at", fiveMinIso)
    .not("sent_at", "is", null)
    .limit(5000);
  const activeRecent = new Set((recentByNum ?? []).map((r: any) => r.whatsapp_number_id));
  const idle = selected.filter((n: string) => !activeRecent.has(n));
  const poolAlert = c.status === "running" && selected.length > 0 && activeRecent.size * 2 < selected.length;

  return json({
    ok: true,
    campaign: {
      id: c.id,
      status: c.status,
      dispatch_mode: c.dispatch_mode,
      kill_switch: c.kill_switch_at ? { at: c.kill_switch_at, reason: c.kill_switch_reason } : null,
      snapshot: c.prepared_at
        ? { prepared_at: c.prepared_at, expires_at: c.prepared_expires_at, signature: c.prepared_signature, fresh: new Date(c.prepared_expires_at).getTime() > Date.now() }
        : null,
      caps: { per_number: c.max_inflight_per_number, per_campaign: c.max_inflight_per_campaign },
    },
    runtime: {
      sent_last_60s: sentLast60,
      rate_per_min: sentLast60,
      active_senders: [...activeSenders],
      idle_senders: [...idleByNum.entries()].map(([id, v]) => ({ id, reason: v.reason, at: v.at })),
      pool_participation_alert: poolAlert,
      idle_pool_members: idle,
    },
  });
}

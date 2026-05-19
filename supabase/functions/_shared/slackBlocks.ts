// Slack Block Kit formatters for Iskra ops notifications

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://iskra.ae";

export function brandTag(workspaceName: string | null, internalCode: string | null): string {
  const name = (workspaceName || "Unknown").trim();
  const code = (internalCode || "").trim();
  return code ? `${name}-${code}` : name;
}

function fmtNumber(n: unknown): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "0";
  return v.toLocaleString("en-US");
}

function fmtPct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function fmtDate(iso: string | null | undefined, tz = "Asia/Dubai"): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// ISO country code -> primary IANA TZ + short label for Slack copy
const COUNTRY_TZ_LABEL: Record<string, { tz: string; label: string }> = {
  US: { tz: "America/New_York", label: "New York" }, CA: { tz: "America/Toronto", label: "Toronto" },
  GB: { tz: "Europe/London", label: "London" }, UK: { tz: "Europe/London", label: "London" },
  AE: { tz: "Asia/Dubai", label: "UAE" }, SA: { tz: "Asia/Riyadh", label: "Riyadh" },
  IN: { tz: "Asia/Kolkata", label: "India" }, DE: { tz: "Europe/Berlin", label: "Berlin" },
  FR: { tz: "Europe/Paris", label: "Paris" }, IT: { tz: "Europe/Rome", label: "Rome" },
  ES: { tz: "Europe/Madrid", label: "Madrid" }, NL: { tz: "Europe/Amsterdam", label: "Amsterdam" },
  BR: { tz: "America/Sao_Paulo", label: "Brazil" }, MX: { tz: "America/Mexico_City", label: "Mexico" },
  AU: { tz: "Australia/Sydney", label: "Sydney" }, JP: { tz: "Asia/Tokyo", label: "Tokyo" },
  SG: { tz: "Asia/Singapore", label: "Singapore" }, HK: { tz: "Asia/Hong_Kong", label: "Hong Kong" },
};

function tzInfo(country: unknown): { tz: string; label: string } {
  const code = String(country || "").toUpperCase();
  return COUNTRY_TZ_LABEL[code] || { tz: "Asia/Dubai", label: "UAE" };
}

function fmtDuration(seconds: number | null | undefined): string {
  const s = Number(seconds || 0);
  if (!isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function fmtTodayOrStartDate(todayCount: number, firstScheduledAt: string | null | undefined, tz: string): string {
  if (todayCount > 0) return `${fmtNumber(todayCount)} msgs`;
  if (!firstScheduledAt) return "—";
  try {
    const d = new Date(firstScheduledAt).toLocaleString("en-GB", { timeZone: tz, day: "2-digit", month: "short" });
    return `Starts ${d}`;
  } catch { return "—"; }
}

function workspaceUrl(slug: string | null): string {
  return `${APP_BASE_URL}/workspace/${slug || ""}`;
}

function campaignUrl(slug: string | null, campaignId: string): string {
  return `${APP_BASE_URL}/workspace/${slug || ""}/campaigns/${campaignId}`;
}

interface WorkspaceInfo { id: string; name: string; slug: string | null; internal_code: string | null }

export interface BlockMessage {
  text: string; // fallback
  blocks: unknown[];
}

export function splitCampaignName(full: string): { base: string; numberLabel: string | null } {
  const idx = full.lastIndexOf(" :: ");
  if (idx === -1) return { base: full, numberLabel: null };
  return { base: full.slice(0, idx), numberLabel: full.slice(idx + 4) };
}

export function buildCampaignGroupBlocks(args: {
  event: string;
  ws: WorkspaceInfo;
  audience: "ops" | "client";
  baseName: string;
  campaignId: string;
  totals: { total: number; sent: number; failed: number };
  parts: Array<{ phone: string | null; label: string | null; total: number; sent: number; failed: number }>;
  payload: Record<string, unknown>;
}): BlockMessage {
  const { event, ws, audience, baseName, campaignId, totals, parts, payload } = args;
  const tag = brandTag(ws.name, ws.internal_code);
  const meta: Record<string, { emoji: string; verb: string }> = {
    campaign_launched: { emoji: "🚀", verb: "launched" },
    campaign_resumed:  { emoji: "▶️", verb: "resumed" },
    campaign_paused:   { emoji: "⏸️", verb: "paused" },
    campaign_completed:{ emoji: "✅", verb: "finished" },
    campaign_cancelled:{ emoji: "🛑", verb: "cancelled" },
    campaign_scheduled:{ emoji: "📅", verb: "scheduled" },
    campaign_failed:   { emoji: "❌", verb: "failed" },
    campaign_day_completed: { emoji: "✅", verb: "day finished" },
  };
  const m = meta[event] || { emoji: "📣", verb: event };
  const numbersWord = parts.length > 1 ? `${parts.length} numbers` : "1 number";
  const headline = audience === "client"
    ? `${m.emoji}  Campaign ${m.verb}`
    : `${m.emoji}  ${tag}  ·  Campaign ${m.verb} · ${numbersWord}`;

  const tzi = tzInfo(payload.recipient_country);
  const todayCount = Number(payload.today_recipients_count || 0);
  const firstAt = (payload.first_scheduled_at as string | null) || (payload.scheduled_start_at as string | null);

  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Campaign*\n${baseName}` },
  ];
  if (event === "campaign_completed" || event === "campaign_cancelled" || event === "campaign_failed") {
    fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(totals.total)} msgs` });
    const delivered = Math.max(0, totals.sent - totals.failed);
    fields.push({ type: "mrkdwn", text: `*Sent*\n${fmtNumber(totals.sent)} (${fmtPct(totals.sent, totals.total)})` });
    fields.push({ type: "mrkdwn", text: `*Delivered*\n${fmtNumber(delivered)} · ${fmtNumber(totals.failed)} failed` });
  } else if (event === "campaign_scheduled" || event === "campaign_launched" || event === "campaign_resumed") {
    fields.push({ type: "mrkdwn", text: `*Today*\n${fmtTodayOrStartDate(todayCount, firstAt, tzi.tz)}` });
    fields.push({ type: "mrkdwn", text: `*Window*\n${payload.window_start || "09:00"} - ${payload.window_end || "18:00"} ${tzi.label}` });
    fields.push({ type: "mrkdwn", text: `*${event === "campaign_scheduled" ? "First send" : "Started"}*\n${fmtDate(firstAt, tzi.tz)} ${tzi.label}` });
  } else if (event === "campaign_paused") {
    fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(totals.total)} msgs` });
    fields.push({ type: "mrkdwn", text: `*Progress*\n${fmtNumber(totals.sent)} / ${fmtNumber(totals.total)} sent` });
    fields.push({ type: "mrkdwn", text: `*Failed*\n${fmtNumber(totals.failed)}` });
  } else {
    fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(totals.total)} msgs` });
  }

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
    { type: "section", fields: fields.slice(0, 10) },
  ];

  // Per-number breakdown for OPS only
  if (audience === "ops" && parts.length > 0) {
    const lines = parts.map((p) => {
      const who = p.phone ? `+${p.phone}` : (p.label || "—");
      if (event === "campaign_completed" || event === "campaign_cancelled" || event === "campaign_failed") {
        return `• ${who} — ${fmtNumber(p.sent)}/${fmtNumber(p.total)} sent${p.failed ? ` · ${p.failed} failed` : ""}`;
      }
      return `• ${who} — ${fmtNumber(p.total)} msgs`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Numbers*\n${lines.join("\n")}` } });
  }

  blocks.push({
    type: "actions",
    elements: [
      { type: "button", text: { type: "plain_text", text: "Open in Iskra" }, url: campaignUrl(ws.slug, campaignId) },
    ],
  });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: audience === "client"
    ? `_${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}_`
    : `_${tag} workspace · ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}_` }] });

  return { text: `${headline}: ${baseName}`, blocks };
}

export function buildCampaignLifecycleBlocks(args: {
  event: string;
  ws: WorkspaceInfo;
  payload: Record<string, unknown>;
  numberPhone?: string | null;
}): BlockMessage {
  const { event, ws, payload, numberPhone } = args;
  const tag = brandTag(ws.name, ws.internal_code);
  const name = String(payload.campaign_name || "Untitled");
  const total = Number(payload.total_recipients || 0);
  const sent = Number(payload.sent_count || 0);
  const failed = Number(payload.failed_count || 0);

  const meta: Record<string, { emoji: string; verb: string }> = {
    campaign_launched: { emoji: "🚀", verb: "launched" },
    campaign_resumed:  { emoji: "▶️", verb: "resumed" },
    campaign_paused:   { emoji: "⏸️", verb: "paused" },
    campaign_completed:{ emoji: "✅", verb: "finished" },
    campaign_cancelled:{ emoji: "🛑", verb: "cancelled" },
    campaign_scheduled:{ emoji: "📅", verb: "scheduled" },
    campaign_failed:   { emoji: "❌", verb: "failed" },
    campaign_day_completed: { emoji: "✅", verb: "day finished" },
  };
  const m = meta[event] || { emoji: "📣", verb: event };

  const headline = `${m.emoji}  ${tag}  ·  Campaign ${m.verb}`;
  const fields: { type: string; text: string }[] = [];

  const tzi = tzInfo(payload.recipient_country || payload.recipient_tz);
  const todayCount = Number(payload.today_recipients_count || 0);
  const firstAt = (payload.first_scheduled_at as string | null) || (payload.scheduled_start_at as string | null);

  fields.push({ type: "mrkdwn", text: `*Campaign*\n${name}` });

  if (event === "campaign_completed" || event === "campaign_cancelled" || event === "campaign_failed") {
    fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(total)} msgs` });
    const delivered = Math.max(0, sent - failed);
    fields.push({ type: "mrkdwn", text: `*Sent*\n${fmtNumber(sent)} (${fmtPct(sent, total)})` });
    fields.push({ type: "mrkdwn", text: `*Delivered*\n${fmtNumber(delivered)} · ${fmtNumber(failed)} failed` });
  } else if (event === "campaign_scheduled" || event === "campaign_launched" || event === "campaign_resumed") {
    fields.push({ type: "mrkdwn", text: `*Today*\n${fmtTodayOrStartDate(todayCount, firstAt, tzi.tz)}` });
    fields.push({ type: "mrkdwn", text: `*Window*\n${payload.window_start || "09:00"} - ${payload.window_end || "18:00"} ${tzi.label}` });
    fields.push({ type: "mrkdwn", text: `*${event === "campaign_scheduled" ? "First send" : "Started"}*\n${fmtDate(firstAt, tzi.tz)} ${tzi.label}` });
  } else if (event === "campaign_paused") {
    fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(total)} msgs` });
    fields.push({ type: "mrkdwn", text: `*Progress*\n${fmtNumber(sent)} / ${fmtNumber(total)} sent` });
    fields.push({ type: "mrkdwn", text: `*Failed*\n${fmtNumber(failed)}` });
  } else if (event === "campaign_day_completed") {
    const sentToday = Number(payload.sent_today || 0);
    const failedToday = Number(payload.failed_today || 0);
    const repliesToday = Number(payload.replies_today || 0);
    const positiveToday = Number(payload.positive_today || 0);
    const avgRespSec = Number(payload.avg_manager_response_seconds || 0);
    const nextDay = payload.next_day ? String(payload.next_day) : null;
    const nextStart = String(payload.next_day_start_local || payload.window_start || "09:00");
    const nextRecipients = Number(payload.next_day_recipients || 0);

    fields.push({ type: "mrkdwn", text: `*Sent today*\n${fmtNumber(sentToday)}${failedToday ? ` · ${fmtNumber(failedToday)} failed` : ""}` });
    fields.push({ type: "mrkdwn", text: `*Replies*\n${fmtNumber(repliesToday)} (${fmtPct(repliesToday, sentToday)} reply rate)` });
    fields.push({ type: "mrkdwn", text: `*Positive*\n${fmtNumber(positiveToday)}${repliesToday ? ` (${fmtPct(positiveToday, repliesToday)} of replies)` : ""}` });
    fields.push({ type: "mrkdwn", text: `*Avg response (positive)*\n${fmtDuration(avgRespSec)}` });
    if (nextDay) {
      fields.push({ type: "mrkdwn", text: `*Next batch*\n${fmtNumber(nextRecipients)} msgs · ${nextDay} at ${nextStart} ${tzi.label}` });
    } else {
      fields.push({ type: "mrkdwn", text: `*Next batch*\nnot scheduled yet` });
    }
  } else {
    fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(total)} msgs` });
  }

  if (numberPhone) {
    fields.push({ type: "mrkdwn", text: `*Number*\n+${numberPhone}` });
  }

  return {
    text: `${headline}: ${name}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
      { type: "section", fields: fields.slice(0, 10) },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open in Iskra" }, url: campaignUrl(ws.slug, String(payload.campaign_id)) },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `_${tag} workspace · ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}_` }] },
    ],
  };
}

export function buildNumberAlertBlocks(args: {
  event: string;
  ws: WorkspaceInfo | null;
  payload: Record<string, unknown>;
}): BlockMessage {
  const { event, ws, payload } = args;
  const tag = ws ? brandTag(ws.name, ws.internal_code) : "Unassigned";
  const phone = `+${payload.phone_number || ""}`;

  const meta: Record<string, { emoji: string; verb: string }> = {
    number_restricted:      { emoji: "⚠️", verb: "restricted" },
    number_blocked:         { emoji: "🚫", verb: "blocked" },
    number_recovered:       { emoji: "🟢", verb: "recovered" },
    number_quality_changed: { emoji: "🟡", verb: "quality changed" },
  };
  const m = meta[event] || { emoji: "📞", verb: event };
  const headline = `${m.emoji}  ${tag}  ·  Number ${m.verb}`;

  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Number*\n${phone}${payload.display_name ? `\n${payload.display_name}` : ""}` },
    { type: "mrkdwn", text: `*Status*\n${payload.previous_status || "-"} → *${payload.status}*` },
  ];
  if (event === "number_quality_changed") {
    fields.push({ type: "mrkdwn", text: `*Messaging limit*\n${payload.previous_messaging_limit || "-"} → *${payload.messaging_limit}*` });
  }
  if (payload.bm_name) {
    fields.push({ type: "mrkdwn", text: `*BM*\n${payload.bm_name}` });
  }

  return {
    text: `${headline}: ${phone}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
      { type: "section", fields },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Open in Iskra" }, url: ws ? workspaceUrl(ws.slug) + "/numbers" : `${APP_BASE_URL}/admin` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `_${tag} · ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}_` }] },
    ],
  };
}

export function buildDigestBlocks(args: {
  kind: "morning" | "evening";
  ws: WorkspaceInfo | null;
  scope: "ops" | "workspace";
  rows: Array<{
    workspace_name: string;
    campaign_name?: string;
    total?: number;
    sent?: number;
    failed?: number;
    scheduled_at?: string | null;
    status?: string;
  }>;
  totals: { campaigns: number; volume: number; sent?: number; failed?: number };
}): BlockMessage {
  const { kind, ws, scope, rows, totals } = args;
  const dateLabel = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "2-digit", month: "short" });
  const emoji = kind === "morning" ? "🌅" : "🌙";
  const headline = kind === "morning"
    ? `${emoji}  Morning plan · ${dateLabel}`
    : `${emoji}  Evening result · ${dateLabel}`;
  const subtitle = scope === "workspace" && ws ? brandTag(ws.name, ws.internal_code) : "All workspaces";

  const summary = kind === "morning"
    ? `*${totals.campaigns}* campaigns · *${fmtNumber(totals.volume)}* msgs planned`
    : `*${fmtNumber(totals.sent || 0)}* sent · *${fmtNumber(totals.failed || 0)}* failed across *${totals.campaigns}* campaigns`;

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${subtitle}*\n${summary}` } },
    { type: "divider" },
  ];

  if (rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "_No activity._" } });
  } else {
    const lines = rows.slice(0, 25).map((r) => {
      if (kind === "morning") {
        return `• *${r.workspace_name}* — ${r.campaign_name || "-"} · ${fmtNumber(r.total)} msgs · ${fmtDate(r.scheduled_at)}`;
      }
      return `• *${r.workspace_name}* — ${r.campaign_name || "-"} · ${fmtNumber(r.sent)}/${fmtNumber(r.total)} sent · ${r.failed ? `${r.failed} failed` : "ok"}`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
  }

  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `_Iskra ops · ${dateLabel}_` }] });

  return { text: `${headline} - ${subtitle}`, blocks };
}

export function buildPositiveLeadBlocks(args: {
  ws: WorkspaceInfo;
  payload: Record<string, unknown>;
}): BlockMessage {
  const { ws, payload } = args;
  const tag = brandTag(ws.name, ws.internal_code);
  const phone = String(payload.contact_phone || "");
  const name = String(payload.contact_name || "").trim();
  const preview = String(payload.last_message_text || "").slice(0, 220);
  const headline = `⭐  ${tag}  ·  Positive lead`;
  const fields: { type: string; text: string }[] = [
    { type: "mrkdwn", text: `*Contact*\n${name || "-"}\n+${phone}` },
  ];
  if (preview) fields.push({ type: "mrkdwn", text: `*Last message*\n${preview}` });
  return {
    text: `${headline}: ${name || phone}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
      { type: "section", fields },
      {
        type: "actions",
        elements: [
          { type: "button", style: "primary", text: { type: "plain_text", text: "Open chat" }, url: `${workspaceUrl(ws.slug)}/inbox?conversation=${payload.conversation_id}` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `_${tag} · ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}_` }] },
    ],
  };
}

export function buildInboxSpikeBlocks(args: {
  ws: WorkspaceInfo;
  unreadCount: number;
  conversations: Array<{ contact_name: string | null; contact_phone: string; unread_count: number; last_message_text: string | null }>;
  pipelineName?: string | null;
}): BlockMessage {
  const { ws, unreadCount, conversations, pipelineName } = args;
  const tag = brandTag(ws.name, ws.internal_code);
  const scope = pipelineName ? `${tag} · ${pipelineName}` : tag;
  const headline = `📨  ${scope}  ·  Inbox needs attention`;
  const lines = conversations.slice(0, 8).map((c) => {
    const who = (c.contact_name || `+${c.contact_phone}`).trim();
    const preview = (c.last_message_text || "").slice(0, 80).replace(/\n/g, " ");
    return `• *${who}* — ${c.unread_count} unread${preview ? ` · _${preview}_` : ""}`;
  });
  return {
    text: `${headline}: ${unreadCount} unread`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: `*${unreadCount}* unread message${unreadCount === 1 ? "" : "s"} across *${conversations.length}* conversation${conversations.length === 1 ? "" : "s"}.` } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") || "_No previews available._" } },
      {
        type: "actions",
        elements: [
          { type: "button", style: "primary", text: { type: "plain_text", text: "Open inbox" }, url: `${workspaceUrl(ws.slug)}/inbox` },
        ],
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `_${tag} · ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}_` }] },
    ],
  };
}

export function buildGupshupMailAlertBlocks(args: {
  category: string;
  severity: "info" | "warning" | "critical";
  ws: WorkspaceInfo | null;
  payload: Record<string, unknown>;
}): BlockMessage {
  const { category, severity, ws, payload } = args;
  const tag = ws ? brandTag(ws.name, ws.internal_code) : "Unmatched";
  const sevEmoji = severity === "critical" ? "🔴" : severity === "warning" ? "🟠" : category === "billing" ? "💳" : "🟢";
  const catLabels: Record<string, string> = {
    number_approved: "Number approved",
    display_name_approved: "Display name approved",
    display_name_rejected: "Display name rejected",
    waba_restricted: "WABA restricted",
    waba_blocked: "WABA blocked",
    quality_changed: "Quality changed",
    tier_upgraded: "Tier upgraded",
    waba_status_other: "WABA status update",
    template_approved: "Template approved",
    template_rejected: "Template rejected",
    billing: "Billing",
    other: "Gupshup notice",
  };
  const label = catLabels[category] || category;
  const phone = String(payload.phone_number || "").trim();
  const secondary = String(payload.secondary || "").trim();
  const snippet = String(payload.snippet || "").slice(0, 220);
  const subject = String(payload.subject || "").slice(0, 200);

  const headline = `${sevEmoji}  ${tag}  —  ${label}`;
  const numberStr = phone ? `+${phone}` : "_unmatched_";
  const line = secondary ? `*${numberStr}*  ·  ${secondary}` : `*${numberStr}*`;

  const ctxBits: string[] = [];
  ctxBits.push(`<https://mail.google.com/mail/u/0/#inbox/${payload.gmail_id}|Open in Gmail>`);
  if (ws) ctxBits.push(`<${workspaceUrl(ws.slug)}/numbers|Open numbers>`);
  ctxBits.push(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" }));

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: headline, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: line } },
  ];
  if (severity === "critical" && snippet) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `>${snippet.replace(/\n/g, " ").slice(0, 200)}` } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: ctxBits.join("  ·  ") }] });

  return { text: `${label} · ${numberStr}${secondary ? ` · ${secondary}` : ""}`, blocks };
}

export async function postSlack(channel: string, msg: BlockMessage): Promise<void> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const slackKey = Deno.env.get("SLACK_API_KEY");
  if (!lovableKey || !slackKey) {
    console.warn("Slack not configured");
    return;
  }
  const res = await fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: msg.text,
      blocks: msg.blocks,
      username: "Iskra",
      icon_url: "https://iskra.ae/iskra-favicon-v2.png",
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(`Slack post failed [${res.status}]: ${JSON.stringify(data)}`);
  }
}

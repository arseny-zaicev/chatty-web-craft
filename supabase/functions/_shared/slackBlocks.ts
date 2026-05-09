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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
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
  };
  const m = meta[event] || { emoji: "📣", verb: event };

  const headline = `${m.emoji}  ${tag}  ·  Campaign ${m.verb}`;
  const fields: { type: string; text: string }[] = [];

  fields.push({ type: "mrkdwn", text: `*Campaign*\n${name}` });
  fields.push({ type: "mrkdwn", text: `*Volume*\n${fmtNumber(total)} msgs` });

  if (event === "campaign_completed" || event === "campaign_cancelled" || event === "campaign_failed") {
    const delivered = sent - failed;
    fields.push({ type: "mrkdwn", text: `*Sent*\n${fmtNumber(sent)} (${fmtPct(sent, total)})` });
    fields.push({ type: "mrkdwn", text: `*Delivered*\n${fmtNumber(delivered)} · ${fmtNumber(failed)} failed` });
  } else if (event === "campaign_scheduled" || event === "campaign_launched" || event === "campaign_resumed") {
    fields.push({ type: "mrkdwn", text: `*Window*\n${payload.window_start || "09:00"} - ${payload.window_end || "18:00"} UAE` });
    fields.push({ type: "mrkdwn", text: `*First send*\n${fmtDate(payload.scheduled_start_at as string)}` });
  } else if (event === "campaign_paused") {
    fields.push({ type: "mrkdwn", text: `*Progress*\n${fmtNumber(sent)} / ${fmtNumber(total)} sent` });
    fields.push({ type: "mrkdwn", text: `*Failed*\n${fmtNumber(failed)}` });
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
}): BlockMessage {
  const { ws, unreadCount, conversations } = args;
  const tag = brandTag(ws.name, ws.internal_code);
  const headline = `📨  ${tag}  ·  Inbox needs attention`;
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

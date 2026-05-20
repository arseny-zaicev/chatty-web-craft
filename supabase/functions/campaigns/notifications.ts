// Campaign notification helpers extracted from campaigns/index.ts (stage 1 split).
// Behavior preserved exactly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_ICON_URL = "https://iskra.ae/iskra-favicon-v2.png";
const SLACK_USERNAME = "Iskra";
const SLACK_API = "https://connector-gateway.lovable.dev/slack/api/chat.postMessage";

/**
 * Fire-and-forget Slack post via the Lovable connector gateway. Never throws.
 * Used by every campaign-state transition that needs to ping ops.
 */
export async function postSlackChannelMessage(channel: string, text: string): Promise<void> {
  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const slackKey = Deno.env.get("SLACK_API_KEY");
    if (!lovableKey || !slackKey) return;
    await fetch(SLACK_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": slackKey,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        text,
        username: SLACK_USERNAME,
        icon_url: SLACK_ICON_URL,
        unfurl_links: false,
        unfurl_media: false,
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

/**
 * Notify a workspace's Slack channel that a campaign just launched.
 * Falls back to #delivery-campaigns when the workspace has no channel.
 */
export async function notifyLaunchSlack(
  workspace_id: string | null,
  payload: { name: string; recipients: number; firstAt: string; mode: string; numberPhone?: string },
): Promise<void> {
  try {
    let channel = "#delivery-campaigns";
    if (workspace_id) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: ws } = await admin.from("workspaces").select("slack_channel_id, name").eq("id", workspace_id).maybeSingle();
        if (ws?.slack_channel_id) channel = ws.slack_channel_id;
      } catch { /* ignore */ }
    }
    const text = `🚀 *Campaign launched*: ${payload.name}\n• Recipients: *${payload.recipients}*\n• First send: ${payload.firstAt}\n• Scheduler: ${payload.mode}${payload.numberPhone ? `\n• Number: +${payload.numberPhone}` : ""}`;
    await postSlackChannelMessage(channel, text);
  } catch { /* ignore */ }
}

// Shared Slack notifier for edge functions (uses Lovable connector gateway)
const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

export async function sendSlackMessage(channel: string, text: string): Promise<void> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const slackKey = Deno.env.get("SLACK_API_KEY");
  if (!lovableKey || !slackKey) {
    console.warn("Slack not configured: missing LOVABLE_API_KEY or SLACK_API_KEY");
    return;
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": slackKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text,
        username: "Iskra",
        icon_url: "https://iskra.ae/iskra-favicon-v2.svg",
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      console.error("Slack chat.postMessage failed", res.status, JSON.stringify(data));
    }
  } catch (e) {
    console.error("Slack send error", e);
  }
}

export const SLACK_BOOKINGS_CHANNEL = "delivery-partners";

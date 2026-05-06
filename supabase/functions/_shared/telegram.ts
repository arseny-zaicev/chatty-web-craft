// Shared Telegram notifier for edge functions
export async function sendTelegramNotification(text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) {
    console.warn("Telegram not configured: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("Telegram send failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("Telegram send error", e);
  }
}

export async function sendTelegramPhoto(photoUrl: string, caption?: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption?.slice(0, 1024),
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error("Telegram sendPhoto failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("Telegram sendPhoto error", e);
  }
}

export async function sendTelegramDocument(fileUrl: string, caption?: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        document: fileUrl,
        caption: caption?.slice(0, 1024),
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error("Telegram sendDocument failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("Telegram sendDocument error", e);
  }
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

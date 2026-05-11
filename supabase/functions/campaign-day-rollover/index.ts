// Detects when a multi-day campaign's "today" batch is fully drained and emits a
// `campaign_day_completed` Slack event with tomorrow's start time and batch size.
// Cron: every 15 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Country -> primary IANA TZ (mirrors LaunchWizard.COUNTRY_TZ)
const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York", CA: "America/Toronto", GB: "Europe/London", UK: "Europe/London",
  AE: "Asia/Dubai", SA: "Asia/Riyadh", IN: "Asia/Kolkata", DE: "Europe/Berlin",
  FR: "Europe/Paris", IT: "Europe/Rome", ES: "Europe/Madrid", NL: "Europe/Amsterdam",
  BR: "America/Sao_Paulo", MX: "America/Mexico_City", AU: "Australia/Sydney",
  JP: "Asia/Tokyo", SG: "Asia/Singapore", HK: "Asia/Hong_Kong",
};

function todayInTz(tz: string | null): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Pull running multi-day campaigns
  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, workspace_id, name, scheduled_dates, schedule_window_start, schedule_window_end, last_day_completed_date, whatsapp_number_id, total_recipients, sent_count, failed_count")
    .eq("status", "running")
    .not("scheduled_dates", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let emitted = 0;
  let checked = 0;

  for (const c of campaigns ?? []) {
    const dates: string[] = (c.scheduled_dates as string[] | null) ?? [];
    if (!dates || dates.length < 2) continue;
    checked++;

    // Resolve recipient TZ from the campaign's number country (look up via whatsapp_numbers)
    let tz: string | null = null;
    let countryCode: string | null = null;
    if (c.whatsapp_number_id) {
      const { data: n } = await admin
        .from("whatsapp_numbers")
        .select("country_code")
        .eq("id", c.whatsapp_number_id)
        .maybeSingle();
      countryCode = (n?.country_code as string | undefined)?.toUpperCase() ?? null;
      tz = countryCode ? (COUNTRY_TZ[countryCode] ?? null) : null;
    }

    const today = todayInTz(tz);
    if (c.last_day_completed_date === today) continue;
    if (!dates.includes(today)) continue;

    // Are there any future days remaining?
    const nextDay = dates.filter((d) => d > today).sort()[0];
    if (!nextDay) continue;

    // Today's terminal-vs-pending counts
    const startIso = `${today}T00:00:00+00:00`;
    const endIso = `${today}T23:59:59+00:00`;

    const { count: pendingToday } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .gte("scheduled_at", startIso)
      .lte("scheduled_at", endIso)
      .in("status", ["pending", "scheduled"]);

    if ((pendingToday ?? 0) > 0) continue;

    const { count: sentToday } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .gte("scheduled_at", startIso)
      .lte("scheduled_at", endIso)
      .eq("status", "sent");

    const { count: failedToday } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .gte("scheduled_at", startIso)
      .lte("scheduled_at", endIso)
      .eq("status", "failed");

    // Tomorrow batch size
    const nextStart = `${nextDay}T00:00:00+00:00`;
    const nextEnd = `${nextDay}T23:59:59+00:00`;
    const { count: nextRecipients } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .gte("scheduled_at", nextStart)
      .lte("scheduled_at", nextEnd);

    // Enqueue Slack event
    const payload = {
      campaign_id: c.id,
      campaign_name: c.name,
      total_recipients: c.total_recipients,
      sent_count: c.sent_count,
      failed_count: c.failed_count,
      window_start: c.schedule_window_start,
      window_end: c.schedule_window_end,
      day: today,
      sent_today: sentToday ?? 0,
      failed_today: failedToday ?? 0,
      next_day: nextDay,
      next_day_start_local: c.schedule_window_start,
      next_day_recipients: nextRecipients ?? 0,
      recipient_tz: countryCode || tz || null,
    };

    const { error: enqErr } = await admin
      .from("slack_event_queue")
      .insert({ event_type: "campaign_day_completed", workspace_id: c.workspace_id, payload });

    if (enqErr) {
      console.error("enqueue failed", c.id, enqErr.message);
      continue;
    }

    await admin
      .from("campaigns")
      .update({ last_day_completed_date: today })
      .eq("id", c.id);

    emitted++;
  }

  return new Response(JSON.stringify({ ok: true, checked, emitted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

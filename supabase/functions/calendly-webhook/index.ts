import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegramNotification, escapeHtml } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, calendly-webhook-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("Calendly webhook:", JSON.stringify(payload).slice(0, 500));

    const event = payload?.event as string | undefined;
    const invitee = payload?.payload?.email || payload?.payload?.invitee?.email;
    const name = payload?.payload?.name || payload?.payload?.invitee?.name;
    const scheduledEvent = payload?.payload?.scheduled_event;
    const eventUri = payload?.payload?.event || scheduledEvent?.uri;
    const startTime = scheduledEvent?.start_time;

    if (!event || !invitee) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find latest submission by email
    const { data: subs } = await supabase
      .from("form_submissions")
      .select("id, data, status")
      .ilike("contact_email", invitee)
      .order("created_at", { ascending: false })
      .limit(1);

    const newStatus = event === "invitee.canceled" ? "in_progress" : "meeting_booked";

    if (subs && subs.length > 0) {
      const sub = subs[0];
      await supabase
        .from("form_submissions")
        .update({
          status: newStatus,
          data: { ...(sub.data as object), calendly: { event, eventUri, startTime, invitee, name } },
        })
        .eq("id", sub.id);
    } else {
      // Create a record so admin still sees the booking
      await supabase.from("form_submissions").insert({
        form_type: "bm_access",
        status: newStatus,
        contact_email: invitee,
        contact_name: name ?? null,
        data: { source: "calendly_only", calendly: { event, eventUri, startTime } },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calendly-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

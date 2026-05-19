// follow-up-dispatch: every minute, picks due rows from pipeline_follow_ups,
// resolves the follow-up template (single or per-number group variant), gets
// or creates a rolling per-day follow-up campaign for the (pipeline, number),
// inserts a campaign_recipient at scheduled_at=now() so the campaigns
// dispatcher sends it on its next tick, and flips the follow-up to dispatched.
//
// The DB trigger pipeline_follow_up_send_at() already applies the
// Europe/Berlin curfew (push to next morning if after 20:00 / before 09:00),
// so this function only needs to honour scheduled_at <= now().

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { acquireJobLock } from "../_shared/jobLock.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const dayKey = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));

type Tpl = { id: string; status: string; whatsapp_number_id: string; user_id: string; variables: any; body: string | null; name: string };

async function resolveTemplates(admin: any, p: any): Promise<Map<string, Tpl>> {
  const out = new Map<string, Tpl>();
  if (p.follow_up_template_group_id) {
    const { data: group } = await admin
      .from("template_groups")
      .select("template_names")
      .eq("id", p.follow_up_template_group_id)
      .maybeSingle();
    const names = (group as any)?.template_names as string[] | undefined;
    if (!names?.length) return out;
    const { data: variants } = await admin
      .from("message_templates")
      .select("id, status, whatsapp_number_id, user_id, variables, body, name")
      .eq("workspace_id", p.workspace_id)
      .in("name", names)
      .eq("status", "approved");
    for (const v of (variants ?? []) as Tpl[]) {
      if (!out.has(v.whatsapp_number_id)) out.set(v.whatsapp_number_id, v);
    }
  } else if (p.follow_up_template_id) {
    const { data: tpl } = await admin
      .from("message_templates")
      .select("id, status, whatsapp_number_id, user_id, variables, body, name")
      .eq("id", p.follow_up_template_id)
      .maybeSingle();
    if (tpl && (tpl as any).status === "approved") out.set((tpl as any).whatsapp_number_id, tpl as Tpl);
  }
  return out;
}

function buildVariables(tpl: Tpl, contactName: string | null): Record<string, string> {
  const vars = Array.isArray(tpl?.variables) ? tpl.variables : [];
  const firstName = (contactName || "there").toString().trim().split(/\s+/)[0] || "there";
  const out: Record<string, string> = {};
  for (const k of vars) out[String(k)] = firstName;
  return out;
}

async function getOrCreateFollowUpCampaign(
  admin: any,
  p: any,
  numberId: string,
  numberUserId: string,
  tplId: string,
  tz: string,
  winStart: string,
  winEnd: string,
): Promise<string | null> {
  const today = dayKey(Date.now(), tz);
  const name = `Follow-up · ${p.name} · ${today} :: ${numberId.slice(0, 8)}`;
  const { data: existing } = await admin
    .from("campaigns")
    .select("id")
    .eq("workspace_id", p.workspace_id)
    .eq("pipeline_id", p.id)
    .eq("kind", "follow_up")
    .eq("whatsapp_number_id", numberId)
    .eq("name", name)
    .eq("status", "running")
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await admin
    .from("campaigns")
    .insert({
      user_id: numberUserId,
      workspace_id: p.workspace_id,
      whatsapp_number_id: numberId,
      template_id: tplId,
      name,
      status: "running",
      kind: "follow_up",
      delay_min_seconds: 30,
      delay_max_seconds: 90,
      total_recipients: 0,
      scheduled_start_at: new Date().toISOString(),
      schedule_window_start: winStart + ":00",
      schedule_window_end: winEnd + ":00",
      respect_recipient_tz: false,
      scheduled_dates: [],
      pipeline_id: p.id,
    })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const release = await acquireJobLock(admin, "follow-up-dispatch");
    if (!release) return json({ ok: true, skipped: "locked" });
    try {
      admin.from("system_heartbeats").upsert({
        name: "follow-up-dispatch",
        last_run_at: new Date().toISOString(),
      }).then(() => {}, () => {});

      // Pull due rows (cap 200/tick).
      const { data: due } = await admin
        .from("pipeline_follow_ups")
        .select("id, workspace_id, pipeline_id, conversation_id, whatsapp_number_id, first_touch_recipient_id, lead_import_id, scheduled_at")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(200);
      if (!due || due.length === 0) return json({ ok: true, processed: 0 });

      // Group by pipeline for batch config load.
      const pipelineIds = Array.from(new Set(due.map((d: any) => d.pipeline_id)));
      const { data: pipes } = await admin
        .from("pipelines")
        .select("id, user_id, workspace_id, name, follow_up_enabled, follow_up_template_id, follow_up_template_group_id, sending_window")
        .in("id", pipelineIds);
      const pipeMap = new Map<string, any>();
      for (const p of pipes ?? []) pipeMap.set((p as any).id, p);

      // Pull contact names for personalization.
      const convIds = Array.from(new Set(due.map((d: any) => d.conversation_id)));
      const { data: convs } = await admin
        .from("conversations")
        .select("id, contact_name, contact_phone")
        .in("id", convIds);
      const convMap = new Map<string, any>();
      for (const c of convs ?? []) convMap.set((c as any).id, c);

      // Resolve templates per pipeline.
      const tplCache = new Map<string, Map<string, Tpl>>();
      for (const p of pipes ?? []) {
        tplCache.set((p as any).id, await resolveTemplates(admin, p));
      }

      // Cache active/ready numbers per workspace.
      const numberCache = new Map<string, any>();
      const numberIds = Array.from(new Set(due.map((d: any) => d.whatsapp_number_id)));
      const { data: nums } = await admin
        .from("whatsapp_numbers")
        .select("id, user_id, status, is_active")
        .in("id", numberIds);
      for (const n of nums ?? []) numberCache.set((n as any).id, n);

      let dispatched = 0;
      let skipped = 0;
      const campaignCache = new Map<string, string>(); // key = pipeline:number

      for (const row of due as any[]) {
        const p = pipeMap.get(row.pipeline_id);
        if (!p || !p.follow_up_enabled) { skipped++; continue; }

        const conv = convMap.get(row.conversation_id);

        const cancelWithNotice = async (reason: string) => {
          await admin.from("pipeline_follow_ups").update({
            status: "cancelled",
            cancelled_reason: reason,
          }).eq("id", row.id);
          await admin.from("slack_event_queue").insert({
            event_type: "follow_up.cancelled",
            workspace_id: row.workspace_id,
            payload: {
              follow_up_id: row.id,
              pipeline_id: row.pipeline_id,
              pipeline_name: p?.name,
              conversation_id: row.conversation_id,
              contact_phone: conv?.contact_phone ?? null,
              contact_name: conv?.contact_name ?? null,
              whatsapp_number_id: row.whatsapp_number_id,
              reason,
              scheduled_at: row.scheduled_at,
            },
          }).then(() => {}, () => {});
        };

        const tplForN = tplCache.get(p.id)?.get(row.whatsapp_number_id);
        if (!tplForN) {
          await cancelWithNotice("no_approved_template_for_number");
          skipped++; continue;
        }

        const num = numberCache.get(row.whatsapp_number_id);
        if (!num || !num.is_active || !["active", "ready"].includes(num.status)) {
          await cancelWithNotice("sender_unavailable");
          skipped++; continue;
        }

        const tz = (p.sending_window as any)?.timezone || "Europe/Berlin";
        const winStart = (p.sending_window as any)?.start || "09:00";
        const winEnd = (p.sending_window as any)?.end || "18:00";

        const cacheKey = `${p.id}:${row.whatsapp_number_id}`;
        let campaignId = campaignCache.get(cacheKey);
        if (!campaignId) {
          campaignId = await getOrCreateFollowUpCampaign(
            admin, p, row.whatsapp_number_id, num.user_id, tplForN.id, tz, winStart, winEnd,
          ) ?? undefined;
          if (campaignId) campaignCache.set(cacheKey, campaignId);
        }
        if (!campaignId) { skipped++; continue; }

        const phone = conv?.contact_phone;
        if (!phone) { skipped++; continue; }

        const { data: rec, error: recErr } = await admin
          .from("campaign_recipients")
          .insert({
            campaign_id: campaignId,
            user_id: num.user_id,
            workspace_id: p.workspace_id,
            whatsapp_number_id: row.whatsapp_number_id,
            contact_phone: phone,
            contact_name: conv?.contact_name ?? null,
            conversation_id: row.conversation_id,
            variables: buildVariables(tplForN, conv?.contact_name ?? null),
            status: "scheduled",
            scheduled_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (recErr || !rec) { skipped++; continue; }

        await admin.from("pipeline_follow_ups").update({
          status: "dispatched",
          campaign_recipient_id: rec.id,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id).eq("status", "scheduled");

        // Bump campaign total_recipients (best-effort).
        const { data: c } = await admin.from("campaigns").select("total_recipients").eq("id", campaignId).single();
        await admin.from("campaigns").update({ total_recipients: (c?.total_recipients || 0) + 1 }).eq("id", campaignId);

        // Fire follow_up_sent stage automations (best-effort).
        try {
          const { data: autos } = await admin
            .from("stage_automations")
            .select("target_stage_id")
            .eq("workspace_id", p.workspace_id)
            .eq("trigger", "follow_up_sent")
            .eq("is_active", true);
          if (autos && autos.length > 0) {
            // Resolve a target stage that belongs to this pipeline (by id, or by name match).
            let targetStageId: string | null = null;
            for (const a of autos as any[]) {
              const { data: st } = await admin
                .from("pipeline_stages")
                .select("id, name, pipeline_id, stage_type")
                .eq("id", a.target_stage_id)
                .maybeSingle();
              if (!st) continue;
              if ((st as any).pipeline_id === p.id) { targetStageId = (st as any).id; break; }
              const { data: byName } = await admin
                .from("pipeline_stages")
                .select("id")
                .eq("pipeline_id", p.id)
                .ilike("name", (st as any).name ?? "")
                .maybeSingle();
              if (byName?.id) { targetStageId = byName.id; break; }
              if ((st as any).stage_type) {
                const { data: byType } = await admin
                  .from("pipeline_stages")
                  .select("id")
                  .eq("pipeline_id", p.id)
                  .eq("stage_type", (st as any).stage_type)
                  .order("position", { ascending: true })
                  .limit(1)
                  .maybeSingle();
                if (byType?.id) { targetStageId = byType.id; break; }
              }
            }
            if (targetStageId) {
              await admin
                .from("deals")
                .update({ stage_id: targetStageId, updated_at: new Date().toISOString() })
                .eq("conversation_id", row.conversation_id)
                .eq("pipeline_id", p.id);
            }
          }
        } catch (_e) { /* swallow automation errors */ }

        dispatched++;
      }

      return json({ ok: true, dispatched, skipped, total: due.length });
    } finally {
      await release();
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Periodic watchdog that applies time-based stage automations:
//   - time_no_inbound: move card after N minutes of no inbound reply
//   - time_in_stage:   move card after N minutes sitting in a stage
//
// Triggered by cron every 5 minutes. Idempotent: once a card moves out of the
// source stage the rule no longer matches it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cronGuard } from "../_shared/cronGuard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Rule = {
  id: string;
  trigger: string;
  delay_minutes: number | null;
  source_stage_id: string | null;
  target_stage_id: string;
  pipeline_id: string;
  workspace_id: string | null;
};

type Stage = { id: string; name: string; pipeline_id: string; stage_type: string | null };

const MAX_CARDS_PER_RULE = 500;

Deno.serve(cronGuard({ jobName: "automation-time-watchdog", lock: true }, async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: rules, error: rulesErr } = await supabase
    .from("stage_automations")
    .select("id, trigger, delay_minutes, source_stage_id, target_stage_id, pipeline_id, workspace_id")
    .eq("is_active", true)
    .in("trigger", ["time_no_inbound", "time_in_stage"]);

  if (rulesErr) {
    console.error("Failed to fetch rules", rulesErr);
    return json({ ok: false, error: rulesErr.message }, 500);
  }

  const stageCache = new Map<string, Stage>();
  const loadStage = async (id: string) => {
    if (stageCache.has(id)) return stageCache.get(id)!;
    const { data } = await supabase
      .from("pipeline_stages")
      .select("id, name, pipeline_id, stage_type")
      .eq("id", id)
      .maybeSingle();
    if (data) stageCache.set(id, data as Stage);
    return data as Stage | null;
  };

  // Resolve target stage to one inside the rule's pipeline (mirror webhook logic).
  const resolveTarget = async (rawTargetId: string, pipelineId: string): Promise<string | null> => {
    const target = await loadStage(rawTargetId);
    if (!target) return null;
    if (target.pipeline_id === pipelineId) return target.id;
    const { data: byName } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .ilike("name", target.name ?? "")
      .maybeSingle();
    if (byName?.id) return byName.id as string;
    if (target.stage_type) {
      const { data: byType } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .eq("stage_type", target.stage_type)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (byType?.id) return byType.id as string;
    }
    return null;
  };

  let movedTotal = 0;
  const results: Array<{ rule: string; moved: number; skipped?: string }> = [];

  for (const rule of (rules ?? []) as Rule[]) {
    if (!rule.delay_minutes || rule.delay_minutes <= 0) {
      results.push({ rule: rule.id, moved: 0, skipped: "no_delay" });
      continue;
    }
    if (!rule.source_stage_id) {
      // Without a source stage the rule would loop forever and re-move cards.
      // Skip rather than risk runaway moves.
      results.push({ rule: rule.id, moved: 0, skipped: "no_source_stage" });
      continue;
    }

    const cutoff = new Date(Date.now() - rule.delay_minutes * 60_000).toISOString();
    const target = await resolveTarget(rule.target_stage_id, rule.pipeline_id);
    if (!target || target === rule.source_stage_id) {
      results.push({ rule: rule.id, moved: 0, skipped: "target_unresolved_or_same" });
      continue;
    }

    let dealsToMove: string[] = [];

    if (rule.trigger === "time_in_stage") {
      // Cards sitting in source_stage_id with updated_at older than cutoff.
      const { data: deals, error } = await supabase
        .from("deals")
        .select("id")
        .eq("pipeline_id", rule.pipeline_id)
        .eq("stage_id", rule.source_stage_id)
        .lt("updated_at", cutoff)
        .limit(MAX_CARDS_PER_RULE);
      if (error) { console.error("time_in_stage query", error); continue; }
      dealsToMove = (deals ?? []).map((d) => d.id);
    } else if (rule.trigger === "time_no_inbound") {
      // Cards in source_stage_id whose conversation has no inbound after their last outbound (or no inbound at all),
      // AND last_message_at older than cutoff.
      const { data: deals, error } = await supabase
        .from("deals")
        .select("id, conversation_id, conversations:conversation_id (last_inbound_at, last_message_at)")
        .eq("pipeline_id", rule.pipeline_id)
        .eq("stage_id", rule.source_stage_id)
        .not("conversation_id", "is", null)
        .limit(MAX_CARDS_PER_RULE);
      if (error) { console.error("time_no_inbound query", error); continue; }
      for (const d of (deals ?? []) as any[]) {
        const conv = d.conversations;
        if (!conv?.last_message_at) continue;
        if (new Date(conv.last_message_at) >= new Date(cutoff)) continue;
        if (conv.last_inbound_at && new Date(conv.last_inbound_at) >= new Date(conv.last_message_at)) continue;
        dealsToMove.push(d.id);
      }
    }

    if (dealsToMove.length === 0) {
      results.push({ rule: rule.id, moved: 0 });
      continue;
    }

    const { error: updErr, count } = await supabase
      .from("deals")
      .update({ stage_id: target, pipeline_id: rule.pipeline_id, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", dealsToMove)
      .eq("stage_id", rule.source_stage_id);
    if (updErr) { console.error("move deals", updErr); continue; }

    const moved = count ?? dealsToMove.length;
    movedTotal += moved;
    results.push({ rule: rule.id, moved });
  }

  return json({ ok: true, rules_evaluated: rules?.length ?? 0, moved_total: movedTotal, results });

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));

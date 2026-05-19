import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Zap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Stage } from "@/lib/crmData";

type TriggerKind =
  | "button_click"
  | "inbound_keyword"
  | "inbound_any"
  | "follow_up_sent"
  | "time_no_inbound"
  | "time_in_stage"
  | "conversation_assigned"
  | "conversation_claimed_self";

type Automation = {
  id: string;
  trigger: TriggerKind;
  trigger_value: string | null;
  target_stage_id: string;
  is_active: boolean;
  workspace_id: string | null;
  pipeline_id: string | null;
  delay_minutes: number | null;
  source_stage_id: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  buttons: Array<{ text?: string; type?: string }> | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId?: string;
  pipelineId?: string | null;
  stages: Stage[];
};

const automationsKey = (wsId?: string, pipelineId?: string | null) => ["pipeline", "automations", wsId ?? "none", pipelineId ?? "none"] as const;
const templatesWithButtonsKey = (wsId?: string) => ["pipeline", "templates-buttons", wsId ?? "none"] as const;

const PRESETS: Record<"positive" | "negative" | "block", string[]> = {
  positive: [
    "yes", "yeah", "yep", "sure", "ok", "okay", "interested", "info", "details",
    "sounds good", "tell me more", "send", "go ahead", "im in", "i'm in",
    "да", "интересно", "давай", "хочу", "согласен",
    "sí", "si", "claro", "oui", "ja", "👍", "✅",
  ],
  negative: [
    "no", "nope", "not interested", "later", "busy", "maybe later", "no thanks",
    "нет", "не интересно", "позже", "занят",
    "non", "nein", "👎",
  ],
  block: [
    "stop", "unsubscribe", "remove", "remove me", "block", "leave me alone",
    "do not message", "don't message", "spam",
    "стоп", "отпишите", "отписаться", "спам", "не пишите",
  ],
};

const PRESET_LABEL: Record<keyof typeof PRESETS, string> = {
  positive: "Positive replies",
  negative: "Negative replies",
  block: "Block / opt-out",
};

export default function StageAutomationsDialog({ open, onOpenChange, workspaceId, pipelineId, stages }: Props) {
  const qc = useQueryClient();
  const [trigger, setTrigger] = useState<TriggerKind>("inbound_keyword");
  const [triggerValue, setTriggerValue] = useState("");
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");
  // For button_click trigger
  const [pickedTemplateId, setPickedTemplateId] = useState<string>("");
  const [pickedButtonText, setPickedButtonText] = useState<string>("");
  // For time-based + assignment triggers
  const [delayValue, setDelayValue] = useState<string>("8");
  const [delayUnit, setDelayUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [sourceStageId, setSourceStageId] = useState<string>("");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: automationsKey(workspaceId, pipelineId),
    queryFn: async (): Promise<Automation[]> => {
      let q = supabase
        .from("stage_automations")
        .select("id, trigger, trigger_value, target_stage_id, is_active, workspace_id, pipeline_id, delay_minutes, source_stage_id")
        .order("created_at", { ascending: false });
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      if (pipelineId) q = q.eq("pipeline_id", pipelineId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Automation[];
    },
    enabled: open && Boolean(pipelineId),
  });

  const { data: templates = [] } = useQuery({
    queryKey: templatesWithButtonsKey(workspaceId),
    queryFn: async (): Promise<TemplateRow[]> => {
      let q = supabase.from("message_templates").select("id, name, buttons").order("name");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as TemplateRow[]).filter((t) => Array.isArray(t.buttons) && t.buttons.length > 0);
    },
    enabled: open && trigger === "button_click",
  });

  const pickedTemplate = useMemo(() => templates.find((t) => t.id === pickedTemplateId), [templates, pickedTemplateId]);

  const insertRule = async (params: {
    trigger: TriggerKind;
    value: string | null;
    targetStageId: string;
    delayMinutes?: number | null;
    sourceStageId?: string | null;
  }) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not authenticated");
    const { error } = await supabase.from("stage_automations").insert({
      user_id: u.user.id,
      workspace_id: workspaceId ?? null,
      pipeline_id: pipelineId ?? null,
      trigger: params.trigger,
      trigger_value: params.value,
      target_stage_id: params.targetStageId,
      delay_minutes: params.delayMinutes ?? null,
      source_stage_id: params.sourceStageId ?? null,
      is_active: true,
    } as any);
    if (error) throw error;
  };

  const isTimeBased = trigger === "time_no_inbound" || trigger === "time_in_stage";
  const isAssignment = trigger === "conversation_assigned" || trigger === "conversation_claimed_self";

  const create = useMutation({
    mutationFn: async () => {
      if (!stageId) throw new Error("Pick a target stage");
      let value: string | null = null;
      let delayMinutes: number | null = null;
      let sourceStage: string | null = null;
      if (trigger === "inbound_keyword") {
        const list = triggerValue.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        if (list.length === 0) throw new Error("Add at least one keyword");
        value = list.join("|");
      } else if (trigger === "button_click") {
        const txt = pickedButtonText.trim();
        if (!txt) throw new Error("Pick a button from the template");
        value = txt;
      } else if (isTimeBased) {
        const n = Number(delayValue);
        if (!Number.isFinite(n) || n <= 0) throw new Error("Enter a positive delay");
        if (!sourceStageId) throw new Error("Pick the source stage to watch");
        if (sourceStageId === stageId) throw new Error("Source and target stages must differ");
        const mult = delayUnit === "minutes" ? 1 : delayUnit === "hours" ? 60 : 1440;
        delayMinutes = Math.round(n * mult);
        sourceStage = sourceStageId;
      } else if (isAssignment) {
        sourceStage = sourceStageId || null;
      }
      await insertRule({ trigger, value, targetStageId: stageId, delayMinutes, sourceStageId: sourceStage });
    },
    onSuccess: () => {
      toast.success("Automation added");
      setTriggerValue("");
      setPickedButtonText("");
      qc.invalidateQueries({ queryKey: automationsKey(workspaceId, pipelineId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const addPreset = useMutation({
    mutationFn: async (kind: keyof typeof PRESETS) => {
      if (!stageId) throw new Error("Pick a target stage first");
      await insertRule({
        trigger: "inbound_keyword",
        value: PRESETS[kind].join("|"),
        targetStageId: stageId,
      });
    },
    onSuccess: () => {
      toast.success("Preset rule added");
      qc.invalidateQueries({ queryKey: automationsKey(workspaceId, pipelineId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async (r: Automation) => {
      const { error } = await supabase.from("stage_automations").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: automationsKey(workspaceId, pipelineId) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stage_automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: automationsKey(workspaceId, pipelineId) });
    },
  });

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const triggerLabel = (t: TriggerKind) => {
    switch (t) {
      case "inbound_any": return "Any inbound reply";
      case "inbound_keyword": return "Keyword in reply";
      case "follow_up_sent": return "Follow-up sent";
      case "button_click": return "Button click";
      case "time_no_inbound": return "No reply for";
      case "time_in_stage": return "Stuck in stage for";
      case "conversation_assigned": return "Chat assigned to a setter";
      case "conversation_claimed_self": return "Setter claimed chat themself";
    }
  };

  const formatDelay = (mins: number) => {
    if (mins % 1440 === 0) return `${mins / 1440}d`;
    if (mins % 60 === 0) return `${mins / 60}h`;
    return `${mins}m`;
  };

  const formatValue = (r: Automation) => {
    if (r.trigger === "time_no_inbound" || r.trigger === "time_in_stage") {
      return r.delay_minutes ? formatDelay(r.delay_minutes) : null;
    }
    if (!r.trigger_value) return null;
    if (r.trigger === "inbound_keyword") {
      const parts = r.trigger_value.split("|");
      if (parts.length <= 3) return parts.map((p) => `"${p}"`).join(", ");
      return `${parts.slice(0, 3).map((p) => `"${p}"`).join(", ")} +${parts.length - 3} more`;
    }
    return `"${r.trigger_value}"`;
  };

  const formatSourceStage = (r: Automation) => {
    if (!r.source_stage_id) return null;
    return stageById.get(r.source_stage_id)?.name ?? null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Stage automations</DialogTitle>
          <DialogDescription>
            When a contact replies (or taps a button), automatically move their card to a stage. Pure text matching - no AI tokens used.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick presets */}
          <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Quick presets
            </div>
            <div className="text-[11px] text-muted-foreground">Pick a target stage below, then click a preset to create a ready-made keyword rule (~20 phrases each, EN + RU + emoji).</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant="outline"
                  disabled={!stageId || addPreset.isPending}
                  onClick={() => addPreset.mutate(k)}
                >
                  + {PRESET_LABEL[k]}
                </Button>
              ))}
            </div>
          </div>

          {/* New rule */}
          <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">New custom rule</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Trigger</label>
                <Select value={trigger} onValueChange={(v) => setTrigger(v as TriggerKind)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound_any">Any inbound reply</SelectItem>
                    <SelectItem value="inbound_keyword">Keyword in reply</SelectItem>
                    <SelectItem value="button_click">Button click</SelectItem>
                    <SelectItem value="follow_up_sent">Follow-up sent (auto)</SelectItem>
                    <SelectItem value="time_no_inbound">No reply for X time</SelectItem>
                    <SelectItem value="time_in_stage">Stuck in stage for X time</SelectItem>
                    <SelectItem value="conversation_assigned">Chat assigned (any setter)</SelectItem>
                    <SelectItem value="conversation_claimed_self">Setter claimed chat themself</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={trigger === "button_click" ? "" : "sm:col-span-1"}>
                <label className="text-[11px] text-muted-foreground">Move to stage</label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden sm:block" />
            </div>

            {trigger === "inbound_keyword" && (
              <div>
                <label className="text-[11px] text-muted-foreground">Keywords (comma-separated, whole-word match, case-insensitive)</label>
                <Input
                  className="h-9"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  placeholder="e.g. interested, info, tell me more"
                />
              </div>
            )}

            {isTimeBased && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Delay</label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    value={delayValue}
                    onChange={(e) => setDelayValue(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Unit</label>
                  <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as typeof delayUnit)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">While in stage</label>
                  <Select value={sourceStageId} onValueChange={setSourceStageId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Pick source stage" /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {isAssignment && (
              <div>
                <label className="text-[11px] text-muted-foreground">Only when card is in stage (optional)</label>
                <Select value={sourceStageId || "__any__"} onValueChange={(v) => setSourceStageId(v === "__any__" ? "" : v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any stage</SelectItem>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {trigger === "button_click" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Template</label>
                  <Select value={pickedTemplateId} onValueChange={(v) => { setPickedTemplateId(v); setPickedButtonText(""); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder={templates.length ? "Pick a template" : "No templates with buttons"} /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Button</label>
                  <Select value={pickedButtonText} onValueChange={setPickedButtonText} disabled={!pickedTemplate}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Pick a button" /></SelectTrigger>
                    <SelectContent>
                      {(pickedTemplate?.buttons ?? []).map((b, i) => (
                        b.text ? <SelectItem key={i} value={b.text}>{b.text}</SelectItem> : null
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !stageId}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add rule
              </Button>
            </div>
          </div>

          {/* Existing rules */}
          <div className="rounded-lg border border-border bg-card/30 divide-y divide-border max-h-[40vh] overflow-y-auto">
            {isLoading && (
              <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            )}
            {!isLoading && rules.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No automations yet.</div>
            )}
            {rules.map((r) => {
              const stage = stageById.get(r.target_stage_id);
              const valueLabel = formatValue(r);
              return (
                <div key={r.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {triggerLabel(r.trigger)}
                      {valueLabel && <span className="text-muted-foreground"> · {valueLabel}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      → moves to
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border">
                        {stage && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />}
                        {stage?.name ?? "Unknown stage"}
                      </span>
                    </div>
                  </div>
                  <Switch checked={r.is_active} onCheckedChange={() => toggle.mutate(r)} />
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

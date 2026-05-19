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

type TriggerKind = "button_click" | "inbound_keyword" | "inbound_any" | "follow_up_sent";

type Automation = {
  id: string;
  trigger: TriggerKind;
  trigger_value: string | null;
  target_stage_id: string;
  is_active: boolean;
  workspace_id: string | null;
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
  stages: Stage[];
};

const automationsKey = (wsId?: string) => ["pipeline", "automations", wsId ?? "none"] as const;
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

export default function StageAutomationsDialog({ open, onOpenChange, workspaceId, stages }: Props) {
  const qc = useQueryClient();
  const [trigger, setTrigger] = useState<TriggerKind>("inbound_keyword");
  const [triggerValue, setTriggerValue] = useState("");
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");
  // For button_click trigger
  const [pickedTemplateId, setPickedTemplateId] = useState<string>("");
  const [pickedButtonText, setPickedButtonText] = useState<string>("");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: automationsKey(workspaceId),
    queryFn: async (): Promise<Automation[]> => {
      let q = supabase
        .from("stage_automations")
        .select("id, trigger, trigger_value, target_stage_id, is_active, workspace_id")
        .order("created_at", { ascending: false });
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Automation[];
    },
    enabled: open,
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

  const insertRule = async (params: { trigger: TriggerKind; value: string | null; targetStageId: string }) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not authenticated");
    const { error } = await supabase.from("stage_automations").insert({
      user_id: u.user.id,
      workspace_id: workspaceId ?? null,
      trigger: params.trigger,
      trigger_value: params.value,
      target_stage_id: params.targetStageId,
      is_active: true,
    });
    if (error) throw error;
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!stageId) throw new Error("Pick a target stage");
      let value: string | null = null;
      if (trigger === "inbound_keyword") {
        const list = triggerValue.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
        if (list.length === 0) throw new Error("Add at least one keyword");
        value = list.join("|");
      } else if (trigger === "button_click") {
        const txt = pickedButtonText.trim();
        if (!txt) throw new Error("Pick a button from the template");
        value = txt;
      }
      await insertRule({ trigger, value, targetStageId: stageId });
    },
    onSuccess: () => {
      toast.success("Automation added");
      setTriggerValue("");
      setPickedButtonText("");
      qc.invalidateQueries({ queryKey: automationsKey(workspaceId) });
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
      qc.invalidateQueries({ queryKey: automationsKey(workspaceId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async (r: Automation) => {
      const { error } = await supabase.from("stage_automations").update({ is_active: !r.is_active }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: automationsKey(workspaceId) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stage_automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: automationsKey(workspaceId) });
    },
  });

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const triggerLabel = (t: TriggerKind) =>
    t === "inbound_any" ? "Any inbound reply" : t === "inbound_keyword" ? "Keyword in reply" : t === "follow_up_sent" ? "Follow-up sent" : "Button click";

  const formatValue = (r: Automation) => {
    if (!r.trigger_value) return null;
    if (r.trigger === "inbound_keyword") {
      const parts = r.trigger_value.split("|");
      if (parts.length <= 3) return parts.map((p) => `"${p}"`).join(", ");
      return `${parts.slice(0, 3).map((p) => `"${p}"`).join(", ")} +${parts.length - 3} more`;
    }
    return `"${r.trigger_value}"`;
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

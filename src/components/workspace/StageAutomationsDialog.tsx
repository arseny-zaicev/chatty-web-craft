import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Stage } from "@/lib/crmData";

type Automation = {
  id: string;
  trigger: "button_click" | "inbound_keyword" | "inbound_any";
  trigger_value: string | null;
  target_stage_id: string;
  is_active: boolean;
  workspace_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId?: string;
  stages: Stage[];
};

const automationsKey = (wsId?: string) => ["pipeline", "automations", wsId ?? "none"] as const;

export default function StageAutomationsDialog({ open, onOpenChange, workspaceId, stages }: Props) {
  const qc = useQueryClient();
  const [trigger, setTrigger] = useState<Automation["trigger"]>("inbound_keyword");
  const [triggerValue, setTriggerValue] = useState("");
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");

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

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      if (!stageId) throw new Error("Pick a target stage");
      if ((trigger === "inbound_keyword" || trigger === "button_click") && !triggerValue.trim()) {
        throw new Error("Trigger value is required");
      }
      const { error } = await supabase.from("stage_automations").insert({
        user_id: u.user.id,
        workspace_id: workspaceId ?? null,
        trigger,
        trigger_value: trigger === "inbound_any" ? null : triggerValue.trim(),
        target_stage_id: stageId,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Automation added");
      setTriggerValue("");
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
  const triggerLabel = (t: Automation["trigger"]) =>
    t === "inbound_any" ? "Any inbound reply" : t === "inbound_keyword" ? "Keyword in reply" : "Button click";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Stage automations</DialogTitle>
          <DialogDescription>
            When a contact replies (or taps a button), automatically move their card to a stage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">New rule</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Trigger</label>
                <Select value={trigger} onValueChange={(v) => setTrigger(v as Automation["trigger"])}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound_any">Any inbound reply</SelectItem>
                    <SelectItem value="inbound_keyword">Keyword in reply</SelectItem>
                    <SelectItem value="button_click">Button click</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  {trigger === "inbound_keyword" ? "Keyword (case-insensitive)" : trigger === "button_click" ? "Button text/id (optional)" : "Value"}
                </label>
                <Input
                  className="h-9"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  disabled={trigger === "inbound_any"}
                  placeholder={trigger === "inbound_keyword" ? "e.g. interested" : trigger === "button_click" ? "e.g. Yes" : ""}
                />
              </div>
              <div>
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
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !stageId}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add rule
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/30 divide-y divide-border max-h-[40vh] overflow-y-auto">
            {isLoading && (
              <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            )}
            {!isLoading && rules.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No automations yet.</div>
            )}
            {rules.map((r) => {
              const stage = stageById.get(r.target_stage_id);
              return (
                <div key={r.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {triggerLabel(r.trigger)}
                      {r.trigger_value && <span className="text-muted-foreground"> · "{r.trigger_value}"</span>}
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

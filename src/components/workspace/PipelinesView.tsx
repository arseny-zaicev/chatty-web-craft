import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, Star, Trash2, Pencil, Check, X, KanbanSquare, Settings2, Webhook } from "lucide-react";
import PipelineConfigSheet from "./PipelineConfigSheet";
import { toast } from "sonner";
import {
  Pipeline,
  pipelinesKey,
  fetchPipelines,
  createPipeline,
  updatePipeline,
  deletePipeline,
  setDefaultPipeline,
} from "@/lib/pipelines";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceAccess } from "@/lib/workspaceRole";

const COLOR_PRESETS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4",
];

const NAME_EXAMPLES = [
  "Ads / India",
  "Outbound / UK",
  "Utility / Existing Customers",
  "Reactivation / Old Leads",
  "Inbound / Website",
];

export default function PipelinesView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data: access } = useWorkspaceAccess(workspaceId);
  const canManage = Boolean(access?.canManageSettings);
  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: pipelinesKey(workspaceId),
    queryFn: () => fetchPipelines(workspaceId),
  });

  const { data: dealCounts = {} } = useQuery({
    queryKey: ["pipelines", workspaceId, "deal-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("deals")
        .select("pipeline_id")
        .eq("workspace_id", workspaceId);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { pipeline_id: string | null }) => {
        if (r.pipeline_id) map[r.pipeline_id] = (map[r.pipeline_id] ?? 0) + 1;
      });
      return map;
    },
  });

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deleting, setDeleting] = useState<Pipeline | null>(null);
  const [configuring, setConfiguring] = useState<Pipeline | null>(null);

  const { data: sourceCounts = {} } = useQuery({
    queryKey: ["pipelines", workspaceId, "source-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("source_connections")
        .select("pipeline_id")
        .eq("workspace_id", workspaceId);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { pipeline_id: string }) => {
        if (r.pipeline_id) map[r.pipeline_id] = (map[r.pipeline_id] ?? 0) + 1;
      });
      return map;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: pipelinesKey(workspaceId) });
    qc.invalidateQueries({ queryKey: ["pipelines", workspaceId, "deal-counts"] });
  };

  const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
  const nameExists = (name: string, ignoreId?: string) => {
    const n = normalize(name).toLowerCase();
    return pipelines.some((p) => p.id !== ignoreId && p.name.trim().toLowerCase() === n);
  };

  const handleCreate = async () => {
    const name = normalize(newName);
    if (!name) return;
    if (nameExists(name)) {
      toast.error("A pipeline with this name already exists");
      return;
    }
    try {
      await createPipeline(workspaceId, { name, color: newColor });
      toast.success("Pipeline created");
      setShowNew(false);
      setNewName("");
      setNewColor(COLOR_PRESETS[0]);
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const startEdit = (p: Pipeline) => {
    setEditingId(p.id); setEditName(p.name); setEditColor(p.color);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const name = normalize(editName);
    if (!name) return;
    if (nameExists(name, editingId)) {
      toast.error("A pipeline with this name already exists");
      return;
    }
    try {
      await updatePipeline(editingId, { name, color: editColor });
      toast.success("Saved");
      setEditingId(null);
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handleSetDefault = async (p: Pipeline) => {
    try {
      await setDefaultPipeline(workspaceId, p.id);
      toast.success(`"${p.name}" is now the default board`);
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deletePipeline(deleting.id, workspaceId);
      toast.success("Pipeline deleted");
      setDeleting(null);
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  if (isLoading) {
    return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const defaultPipeline = pipelines.find((p) => p.is_default);

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <KanbanSquare className="w-4 h-4 text-primary" /> Pipelines
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Each pipeline is an independent board with its own stages. Use a short operational name like "Ads / India" or "Outbound / UK".
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-1" /> New pipeline
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
        {pipelines.map((p) => {
          const isEditing = editingId === p.id;
          const dealCount = dealCounts[p.id] ?? 0;
          const sourceCount = sourceCounts[p.id] ?? 0;
          const isExternal = sourceCount > 0;
          return (
            <div key={p.id} className="p-3 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: isEditing ? editColor : p.color }} />
              {isEditing ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-sm flex-1"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition ${editColor === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Check className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {p.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-primary" /> Default
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${isExternal ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-muted/40 text-muted-foreground border-border"}`}>
                        {isExternal ? <><Webhook className="w-2.5 h-2.5" /> Externally fed</> : "Manual"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dealCount} deal{dealCount === 1 ? "" : "s"}
                      {sourceCount > 0 && <> · {sourceCount} source{sourceCount === 1 ? "" : "s"}</>}
                      {(p.default_sender_number_ids?.length ?? 0) > 0 && (
                        <> · {p.default_sender_number_ids.length} sender{p.default_sender_number_ids.length === 1 ? "" : "s"} (round-robin)</>
                      )}
                      {p.auto_outreach_enabled && <> · auto first-touch</>}
                    </div>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setConfiguring(p)} title="Configure">
                      <Settings2 className="w-3.5 h-3.5 mr-1" /> Configure
                    </Button>
                  )}
                  {canManage && !p.is_default && (
                    <Button size="sm" variant="ghost" onClick={() => handleSetDefault(p)} title="Set as default">
                      <Star className="w-3.5 h-3.5 mr-1" /> Make default
                    </Button>
                  )}
                  {canManage && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(p)} title="Rename">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(p)}
                      disabled={p.is_default}
                      title={p.is_default ? "Cannot delete the default board" : "Delete"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        })}
        {pipelines.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">No pipelines yet.</div>
        )}
      </div>

      {/* New pipeline dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New pipeline</DialogTitle>
          <DialogDescription>Creates an independent board pre-seeded with default stages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Ads / India"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Use a short operational name like Ads / India or Outbound / UK. Pick something your whole team will recognise.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {NAME_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setNewName(ex)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition ${newColor === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleting?.name}"?</DialogTitle>
            <DialogDescription>
              {deleting && (dealCounts[deleting.id] ?? 0) > 0
                ? `${dealCounts[deleting.id]} deal(s) and their conversations will move to "${defaultPipeline?.name ?? "the default board"}".`
                : "This board has no deals. Its stages will be removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete pipeline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PipelineConfigSheet
        pipeline={configuring}
        open={!!configuring}
        onClose={() => { setConfiguring(null); invalidate(); }}
      />
    </div>
  );
}

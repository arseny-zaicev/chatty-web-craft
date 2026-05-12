// Template Groups manager — pick multiple template names that should be treated
// as a single logical template during launch.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fetchTemplateGroups, type TemplateGroup, type Template } from "@/lib/launchData";

const templateGroupsKey = (wid: string) => ["template-groups", wid] as const;

export default function TemplateGroupsDialog({
  open,
  onOpenChange,
  workspaceId,
  templates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  templates: Template[];
}) {
  const qc = useQueryClient();
  const { data: groups = [], isLoading } = useQuery({
    queryKey: templateGroupsKey(workspaceId),
    queryFn: () => fetchTemplateGroups(workspaceId),
    enabled: open,
  });

  const [editing, setEditing] = useState<TemplateGroup | null>(null);
  const [creating, setCreating] = useState(false);

  // Reset state when closed
  useEffect(() => { if (!open) { setEditing(null); setCreating(false); } }, [open]);

  const distinctTemplateNames = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => set.add(t.name));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("template_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: templateGroupsKey(workspaceId) });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="w-4 h-4" />Template groups</DialogTitle>
        </DialogHeader>

        {editing || creating ? (
          <GroupEditor
            workspaceId={workspaceId}
            templateNames={distinctTemplateNames}
            initial={editing}
            onCancel={() => { setEditing(null); setCreating(false); }}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: templateGroupsKey(workspaceId) });
              setEditing(null);
              setCreating(false);
            }}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Group templates that share the same logical purpose under one name. The Launch wizard treats
              all picked templates as one logical template — each number uses its own variant from the group.
            </p>
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : groups.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No groups yet. Create one to manually match templates with different names.
              </div>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border">
                {groups.map((g) => (
                  <div key={g.id} className="px-3 py-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{g.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {g.template_names.length} template{g.template_names.length === 1 ? "" : "s"} · {g.template_names.join(", ")}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{g.category}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setEditing(g)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => {
                      if (confirm(`Delete group "${g.name}"?`)) remove.mutate(g.id);
                    }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-3.5 h-3.5 mr-1" />New group</Button>
            </div>
          </div>
        )}

        {!editing && !creating && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupEditor({
  workspaceId,
  templateNames,
  initial,
  onCancel,
  onSaved,
}: {
  workspaceId: string;
  templateNames: string[];
  initial: TemplateGroup | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<"marketing" | "utility">(initial?.category ?? "marketing");
  const [picked, setPicked] = useState<Set<string>>(new Set(initial?.template_names ?? []));
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return templateNames;
    return templateNames.filter((n) => n.toLowerCase().includes(q));
  }, [templateNames, filter]);

  const toggle = (n: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (picked.size === 0) { toast.error("Pick at least one template"); return; }
    setSaving(true);
    try {
      const payload = {
        workspace_id: workspaceId,
        name: name.trim(),
        category,
        template_names: Array.from(picked),
      };
      let error;
      if (initial) {
        ({ error } = await supabase.from("template_groups").update(payload).eq("id", initial.id));
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        ({ error } = await supabase.from("template_groups").insert({ ...payload, created_by: user?.id }));
      }
      if (error) throw error;
      toast.success(initial ? "Group updated" : "Group created");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Group name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goflow Main" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</label>
          <Select value={category} onValueChange={(v) => setCategory(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="marketing">Marketing</SelectItem>
              <SelectItem value="utility">Utility</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Templates ({picked.size} picked)
          </label>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="h-7 w-40 text-xs" />
        </div>
        <div className="rounded-md border border-border max-h-72 overflow-auto divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No templates match.</div>
          ) : filtered.map((n) => (
            <label key={n} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/30">
              <Checkbox checked={picked.has(n)} onCheckedChange={() => toggle(n)} />
              <span className="font-mono truncate">{n}</span>
            </label>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          {initial ? "Save changes" : "Create group"}
        </Button>
      </DialogFooter>
    </div>
  );
}

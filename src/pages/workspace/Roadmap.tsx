import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorkspaces, type Workspace } from "@/lib/workspaces";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Status = "idea" | "planned" | "in_progress" | "shipped";

type RoadmapItem = {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  description: string | null;
  why: string | null;
  status: Status;
  tags: string[];
  priority: number;
  position: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS: { key: Status; label: string; tone: string }[] = [
  { key: "idea", label: "Ideas", tone: "bg-muted/40" },
  { key: "planned", label: "Planned", tone: "bg-blue-500/5 dark:bg-blue-500/10" },
  { key: "in_progress", label: "In progress", tone: "bg-amber-500/5 dark:bg-amber-500/10" },
  { key: "shipped", label: "Shipped", tone: "bg-emerald-500/5 dark:bg-emerald-500/10" },
];

const PRIORITY_LABEL = ["Low", "Medium", "High", "Critical"];

export default function Roadmap() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();

  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: fetchWorkspaces });
  const ws = (workspaces ?? []).find((w: Workspace) => w.slug === slug);

  const { data: items, isLoading } = useQuery({
    queryKey: ["roadmap", ws?.id],
    queryFn: async () => {
      if (!ws?.id) return [];
      const { data, error } = await supabase
        .from("roadmap_items")
        .select("*")
        .eq("workspace_id", ws.id)
        .order("priority", { ascending: false })
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoadmapItem[];
    },
    enabled: !!ws?.id,
  });

  const grouped = useMemo(() => {
    const map: Record<Status, RoadmapItem[]> = { idea: [], planned: [], in_progress: [], shipped: [] };
    (items ?? []).forEach((it) => map[it.status].push(it));
    return map;
  }, [items]);

  const [editing, setEditing] = useState<RoadmapItem | null>(null);
  const [open, setOpen] = useState(false);

  // Auto-seed from chat ideas (only first time, when board is empty)
  useEffect(() => {
    if (!ws?.id || isLoading) return;
    if ((items ?? []).length > 0) return;
    const seedKey = `iskra:roadmap:seeded:${ws.id}`;
    if (localStorage.getItem(seedKey)) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const seed: Array<Partial<RoadmapItem>> = [
        { title: "Smart scheduling (send window + multi-day)", description: "Pick days + time window 09:00–22:00, respect recipient timezone", status: "in_progress", tags: ["scheduling"], priority: 3, why: "Avoid late-hour pings, distribute load across days" },
        { title: "Poisson scheduler + cross-number shuffle", description: "Exponential intervals between sends, round-robin across numbers so no two numbers fire in the same second", status: "planned", tags: ["scheduling", "backend"], priority: 3, why: "Looks like organic human pattern, lowers ban rate" },
        { title: "Slack notifications: campaign launched + completed", description: "Post to #iskra-campaigns. Later: per-client channels", status: "planned", tags: ["notifications", "slack"], priority: 2, why: "Visibility for the team without opening dashboard" },
        { title: "Google Calendar event on launch", description: "Transparent event (no busy block) so meetings can stack on top", status: "planned", tags: ["notifications", "calendar"], priority: 2, why: "Personal awareness of all launches across days" },
        { title: "A/B copy variants in Launch", description: "Pick 2–3 templates, split traffic, track winner by open/reply", status: "idea", tags: ["launch", "experiments"], priority: 3, why: "Optimise copy per audience" },
        { title: "Campaigns & Stats page", description: "Per-campaign dashboard: sent, delivered, read, replied, CTR, A/B winner", status: "idea", tags: ["analytics"], priority: 3, why: "Need data to learn what works" },
        { title: "Auto-suggest audience name from DB batch", description: "When picking a DB batch, prefill audience field from batch name", status: "shipped", tags: ["launch", "ux"], priority: 1 },
        { title: "Auto-map template variables from batch columns", description: "Aggressive matching: exact name → var_N → stripped → positional", status: "shipped", tags: ["launch", "ux"], priority: 1 },
      ];
      const rows = seed.map((s, i) => ({ ...s, workspace_id: ws.id, user_id: user.id, position: i }));
      const { error } = await supabase.from("roadmap_items").insert(rows as any);
      if (!error) {
        localStorage.setItem(seedKey, "1");
        qc.invalidateQueries({ queryKey: ["roadmap", ws.id] });
      }
    })();
  }, [ws?.id, items, isLoading, qc]);

  async function saveItem(payload: Partial<RoadmapItem>) {
    if (!ws?.id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing?.id) {
      const { error } = await supabase
        .from("roadmap_items")
        .update({
          title: payload.title,
          description: payload.description,
          why: payload.why,
          status: payload.status,
          tags: payload.tags,
          priority: payload.priority,
        })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("roadmap_items").insert({
        workspace_id: ws.id,
        user_id: user.id,
        title: payload.title ?? "Untitled",
        description: payload.description ?? null,
        why: payload.why ?? null,
        status: payload.status ?? "idea",
        tags: payload.tags ?? [],
        priority: payload.priority ?? 1,
        position: (items?.length ?? 0),
      });
      if (error) return toast.error(error.message);
      toast.success("Added");
    }
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["roadmap", ws.id] });
  }

  async function moveItem(item: RoadmapItem, status: Status) {
    const { error } = await supabase.from("roadmap_items").update({ status }).eq("id", item.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roadmap", ws?.id] });
  }

  async function deleteItem(item: RoadmapItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    const { error } = await supabase.from("roadmap_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roadmap", ws?.id] });
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
          <p className="text-sm text-muted-foreground">Drop ideas, track what's planned, shipped. Private to the team.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="w-4 h-4 mr-2" />New idea</Button>
          </DialogTrigger>
          <ItemDialog initial={editing} onSave={saveItem} />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUMNS.map((col) => (
            <div key={col.key} className={`rounded-lg ${col.tone} p-3 min-h-[200px] space-y-2`}>
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</div>
                <div className="text-xs text-muted-foreground">{grouped[col.key].length}</div>
              </div>
              {grouped[col.key].map((item) => (
                <Card key={item.id} className="p-3 space-y-2 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm leading-tight">{item.title}</div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(item); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  {item.description && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{item.description}</div>}
                  {item.why && <div className="text-xs text-foreground/70 italic"><span className="font-medium not-italic">Why:</span> {item.why}</div>}
                  <div className="flex flex-wrap gap-1 items-center">
                    {item.priority > 0 && <Badge variant="secondary" className="text-[10px]">{PRIORITY_LABEL[item.priority] ?? "Low"}</Badge>}
                    {item.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {COLUMNS.filter((c) => c.key !== item.status).map((c) => (
                      <Button key={c.key} size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => moveItem(item, c.key)}>
                        → {c.label}
                      </Button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemDialog({ initial, onSave }: { initial: RoadmapItem | null; onSave: (payload: Partial<RoadmapItem>) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [why, setWhy] = useState(initial?.why ?? "");
  const [status, setStatus] = useState<Status>(initial?.status ?? "idea");
  const [priority, setPriority] = useState<number>(initial?.priority ?? 1);
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));

  useEffect(() => {
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setWhy(initial?.why ?? "");
    setStatus(initial?.status ?? "idea");
    setPriority(initial?.priority ?? 1);
    setTagsInput((initial?.tags ?? []).join(", "));
  }, [initial]);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "Edit item" : "New idea"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Slack notifications on launch" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What it does" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Why</label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Why this matters" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_LABEL.map((p, i) => <SelectItem key={i} value={String(i)}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="scheduling, slack, ux" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({
          title: title.trim() || "Untitled",
          description: description.trim() || null,
          why: why.trim() || null,
          status, priority,
          tags: tagsInput.split(",").map((s) => s.trim()).filter(Boolean),
        })}>{initial ? "Save" : "Add"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BookOpen, Star, Search, Plus, Trash2, Save, Loader2, Link2, FileText, Type, AlignLeft,
} from "lucide-react";
import {
  BUILTIN_FIELDS, LibraryField, LibraryFieldType, SavedReply,
  fetchLibraryFields, fetchSavedReplies, libraryKeys,
} from "@/lib/workspaceLibrary";

type Tab = "replies" | "fields" | "custom";

export default function WorkspaceLibrary({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("replies");

  const { data: fields = [], isLoading: lf } = useQuery({
    queryKey: libraryKeys.fields(workspaceId),
    queryFn: () => fetchLibraryFields(workspaceId),
  });
  const { data: replies = [], isLoading: lr } = useQuery({
    queryKey: libraryKeys.replies(workspaceId),
    queryFn: () => fetchSavedReplies(workspaceId),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: libraryKeys.fields(workspaceId) });
    qc.invalidateQueries({ queryKey: libraryKeys.replies(workspaceId) });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        <h2 className="font-display text-xl">Workspace Library</h2>
        <span className="text-xs text-muted-foreground">Internal — operators only</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {[
          { k: "replies", label: "Saved Replies" },
          { k: "fields", label: "Core Links / Assets" },
          { k: "custom", label: "Custom Fields" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as Tab)}
            className={`text-xs px-3 py-2 -mb-px border-b-2 transition ${
              tab === t.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "replies" && <SavedRepliesPane workspaceId={workspaceId} replies={replies} loading={lr} onChange={invalidateAll} />}
      {tab === "fields" && <CoreFieldsPane workspaceId={workspaceId} fields={fields} loading={lf} onChange={invalidateAll} />}
      {tab === "custom" && <CustomFieldsPane workspaceId={workspaceId} fields={fields} loading={lf} onChange={invalidateAll} />}
    </div>
  );
}

// ---------------- Saved Replies ----------------
function SavedRepliesPane({ workspaceId, replies, loading, onChange }: {
  workspaceId: string; replies: SavedReply[]; loading: boolean; onChange: () => void;
}) {
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [folder, setFolder] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<SavedReply> | null>(null);

  const folders = useMemo(() => {
    const s = new Set<string>();
    replies.forEach((r) => r.folder && s.add(r.folder));
    return Array.from(s).sort();
  }, [replies]);

  const filtered = replies.filter((r) => {
    if (favOnly && !r.is_favorite) return false;
    if (folder !== "all" && r.folder !== folder) return false;
    if (q) {
      const hay = `${r.title} ${r.body} ${r.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const save = useMutation({
    mutationFn: async (r: Partial<SavedReply>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in");
      if (r.id) {
        const { error } = await supabase.from("workspace_saved_replies").update({
          title: r.title ?? "", body: r.body ?? "", folder: r.folder || null,
          tags: r.tags ?? [], is_favorite: !!r.is_favorite,
        }).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workspace_saved_replies").insert({
          workspace_id: workspaceId, user_id: auth.user.id,
          title: r.title ?? "", body: r.body ?? "", folder: r.folder || null,
          tags: r.tags ?? [], is_favorite: !!r.is_favorite,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { setEditing(null); toast.success("Saved"); onChange(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_saved_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); onChange(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const toggleFav = async (r: SavedReply) => {
    await supabase.from("workspace_saved_replies").update({ is_favorite: !r.is_favorite }).eq("id", r.id);
    onChange();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search replies, tags, body..." className="pl-9 h-9" />
        </div>
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="all">All folders</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <Button size="sm" variant={favOnly ? "default" : "outline"} onClick={() => setFavOnly((v) => !v)}>
          <Star className={`w-3.5 h-3.5 mr-1 ${favOnly ? "fill-current" : ""}`} />Favorites
        </Button>
        <Button size="sm" onClick={() => setEditing({ title: "", body: "", folder: "", tags: [], is_favorite: false })}>
          <Plus className="w-4 h-4 mr-1" />New reply
        </Button>
      </div>

      {editing && (
        <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
          <Input placeholder="Title" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <Textarea rows={4} placeholder="Body. Use {website_url}, {booking_url}, {cta_text}, custom keys..." value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Folder (optional)" value={editing.folder ?? ""} onChange={(e) => setEditing({ ...editing, folder: e.target.value })} className="w-48" />
            <Input
              placeholder="Tags (comma separated)"
              value={(editing.tags ?? []).join(", ")}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="w-64"
            />
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={!!editing.is_favorite} onChange={(e) => setEditing({ ...editing, is_favorite: e.target.checked })} />
              Favorite
            </label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={() => save.mutate(editing)} disabled={save.isPending || !editing.title || !editing.body}>
                <Save className="w-3.5 h-3.5 mr-1" />Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty text="No saved replies yet." />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card/30 p-3">
              <div className="flex items-start gap-2">
                <button onClick={() => toggleFav(r)} title="Favorite" className="mt-0.5">
                  <Star className={`w-4 h-4 ${r.is_favorite ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    {r.folder && <Badge variant="outline" className="text-[10px]">{r.folder}</Badge>}
                    {r.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    {r.last_used_at && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        used {new Date(r.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-1 line-clamp-3">{r.body}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)}><FileText className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Delete this reply?")) del.mutate(r.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Core Fields (built-in) ----------------
function CoreFieldsPane({ workspaceId, fields, loading, onChange }: {
  workspaceId: string; fields: LibraryField[]; loading: boolean; onChange: () => void;
}) {
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async ({ key, label, type, value }: { key: string; label: string; type: LibraryFieldType; value: string }) => {
      const existing = byKey.get(key);
      if (existing) {
        const { error } = await supabase.from("workspace_library_fields").update({ value, label, type }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workspace_library_fields").insert({
          workspace_id: workspaceId, key, label, type, value, is_builtin: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => { setDrafts((p) => { const n = { ...p }; delete n[vars.key]; return n; }); toast.success("Saved"); onChange(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Built-in workspace fields. Use these keys in saved-reply templates: <code className="bg-muted px-1 rounded">{`{key}`}</code>.</p>
      {BUILTIN_FIELDS.map((b) => {
        const existing = byKey.get(b.key);
        const value = drafts[b.key] ?? existing?.value ?? "";
        const dirty = drafts[b.key] !== undefined;
        return (
          <div key={b.key} className="rounded-lg border border-border bg-card/30 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <TypeIcon t={b.type} />
              <span className="font-medium text-sm">{b.label}</span>
              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{`{${b.key}}`}</code>
              {dirty && <Button size="sm" className="ml-auto h-7" onClick={() => save.mutate({ key: b.key, label: b.label, type: b.type, value })}>Save</Button>}
            </div>
            {b.type === "long_text" ? (
              <Textarea rows={3} value={value} onChange={(e) => setDrafts((p) => ({ ...p, [b.key]: e.target.value }))} />
            ) : (
              <Input value={value} placeholder={b.type === "link" ? "https://..." : ""} onChange={(e) => setDrafts((p) => ({ ...p, [b.key]: e.target.value }))} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Custom Fields ----------------
function CustomFieldsPane({ workspaceId, fields, loading, onChange }: {
  workspaceId: string; fields: LibraryField[]; loading: boolean; onChange: () => void;
}) {
  const custom = fields.filter((f) => !f.is_builtin);
  const [adding, setAdding] = useState<{ key: string; label: string; type: LibraryFieldType; value: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<LibraryField>>>({});

  const upsert = useMutation({
    mutationFn: async (row: Partial<LibraryField> & { key: string }) => {
      if (row.id) {
        const { error } = await supabase.from("workspace_library_fields").update({
          label: row.label, type: row.type, value: row.value ?? "",
        }).eq("id", row.id);
        if (error) throw error;
      } else {
        if (!/^[a-z0-9_]+$/.test(row.key)) throw new Error("Key must be lowercase letters, numbers, underscore");
        const { error } = await supabase.from("workspace_library_fields").insert({
          workspace_id: workspaceId, key: row.key, label: row.label ?? row.key,
          type: row.type ?? "text", value: row.value ?? "", is_builtin: false,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      if (vars.id) setDrafts((p) => { const n = { ...p }; delete n[vars.id!]; return n; });
      else setAdding(null);
      toast.success("Saved"); onChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_library_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); onChange(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Define your own workspace variables. Reference them in saved replies as <code className="bg-muted px-1 rounded">{`{key}`}</code>.</p>
        <Button size="sm" onClick={() => setAdding({ key: "", label: "", type: "text", value: "" })}>
          <Plus className="w-4 h-4 mr-1" />New field
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card/40 p-3 grid sm:grid-cols-4 gap-2">
          <Input placeholder="key (e.g. demo_video)" value={adding.key} onChange={(e) => setAdding({ ...adding, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
          <Input placeholder="Label" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
          <select value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value as LibraryFieldType })} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="text">text</option>
            <option value="long_text">long_text</option>
            <option value="link">link</option>
          </select>
          <Input placeholder="Value" value={adding.value} onChange={(e) => setAdding({ ...adding, value: e.target.value })} />
          <div className="sm:col-span-4 flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
            <Button size="sm" onClick={() => upsert.mutate(adding)} disabled={!adding.key || !adding.label}>
              <Save className="w-3.5 h-3.5 mr-1" />Save
            </Button>
          </div>
        </div>
      )}

      {custom.length === 0 ? <Empty text="No custom fields yet." /> : (
        <div className="space-y-2">
          {custom.map((f) => {
            const draft = { ...f, ...(drafts[f.id] ?? {}) };
            const dirty = !!drafts[f.id];
            return (
              <div key={f.id} className="rounded-lg border border-border bg-card/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TypeIcon t={draft.type as LibraryFieldType} />
                  <Input className="max-w-[220px] h-8" value={draft.label} onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: { ...(p[f.id] ?? {}), label: e.target.value } }))} />
                  <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{`{${f.key}}`}</code>
                  <select
                    value={draft.type ?? "text"}
                    onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: { ...(p[f.id] ?? {}), type: e.target.value as LibraryFieldType } }))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="text">text</option>
                    <option value="long_text">long_text</option>
                    <option value="link">link</option>
                  </select>
                  {dirty && <Button size="sm" className="h-7" onClick={() => upsert.mutate(draft)}>Save</Button>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive ml-auto" onClick={() => { if (confirm(`Delete field {${f.key}}?`)) del.mutate(f.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {draft.type === "long_text" ? (
                  <Textarea rows={2} value={draft.value ?? ""} onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: { ...(p[f.id] ?? {}), value: e.target.value } }))} />
                ) : (
                  <Input value={draft.value ?? ""} onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: { ...(p[f.id] ?? {}), value: e.target.value } }))} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const TypeIcon = ({ t }: { t: LibraryFieldType }) =>
  t === "link" ? <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
  : t === "long_text" ? <AlignLeft className="w-3.5 h-3.5 text-muted-foreground" />
  : <Type className="w-3.5 h-3.5 text-muted-foreground" />;

const Spinner = () => <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
const Empty = ({ text }: { text: string }) => <div className="p-10 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">{text}</div>;

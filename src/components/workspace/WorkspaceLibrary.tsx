import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Folder, FolderOpen, Star, Search, Plus, Trash2, Link2, MessageSquare,
  Loader2, Copy, ChevronDown, ChevronRight, Settings2, Pencil, Sparkles,
} from "lucide-react";
import {
  BUILTIN_FIELDS, LibraryField, SavedReply, SavedReplyScope,
  fetchLibraryFields, fetchSavedReplies, libraryKeys,
} from "@/lib/workspaceLibrary";
import { useWorkspaceRole, isManagerLike } from "@/lib/workspaceRole";

const ALL = "__all__";
const FAV = "__fav__";
const SCOPE_ALL = "all" as const;
type ScopeFilter = typeof SCOPE_ALL | SavedReplyScope;

type Draft = Partial<SavedReply> & { url?: string };

/** Detect a URL in a snippet body so a snippet can act as a "link". */
const looksLikeUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

/** Starter pack — seeded once on user request. Premium minimal: only what's actually used. */
const STARTER_PACK: { title: string; body: string; folder: string; is_favorite?: boolean }[] = [
  // Links — placeholders the operator fills in once
  { title: "Website",       body: "{website_url}",     folder: "Links", is_favorite: true },
  { title: "Book a call",   body: "{booking_url}",     folder: "Links", is_favorite: true },
  { title: "Pricing",       body: "{pricing_url}",     folder: "Links" },
  { title: "Case study",    body: "{case_study_url}",  folder: "Links" },
  // Greetings
  { title: "Intro",         body: "Hi! Thanks for reaching out — happy to help. What are you looking for?", folder: "Greetings" },
  { title: "Quick reply",   body: "Got it, one moment please.", folder: "Greetings" },
  // Follow-ups
  { title: "Soft nudge",    body: "Just checking in — did you get a chance to look at this?", folder: "Follow-ups" },
  { title: "Send booking",  body: "Easiest is to grab a slot here: {booking_url}", folder: "Follow-ups" },
];

export default function WorkspaceLibrary({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [activeFolder, setActiveFolder] = useState<string>(ALL);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(SCOPE_ALL);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showVars, setShowVars] = useState(false);

  const { data: role } = useWorkspaceRole(workspaceId);
  const canManageWorkspace = isManagerLike(role);
  const defaultScope: SavedReplyScope = canManageWorkspace ? "workspace" : "personal";

  const { data: replies = [], isLoading } = useQuery({
    queryKey: libraryKeys.replies(workspaceId),
    queryFn: () => fetchSavedReplies(workspaceId),
  });
  const { data: fields = [] } = useQuery({
    queryKey: libraryKeys.fields(workspaceId),
    queryFn: () => fetchLibraryFields(workspaceId),
  });

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    replies.forEach((r) => {
      const f = r.folder?.trim() || "Uncategorized";
      counts.set(f, (counts.get(f) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [replies]);

  const items = useMemo(() => {
    return replies.filter((r) => {
      if (activeFolder === FAV && !r.is_favorite) return false;
      if (activeFolder !== ALL && activeFolder !== FAV) {
        const f = r.folder?.trim() || "Uncategorized";
        if (f !== activeFolder) return false;
      }
      if (q) {
        const hay = `${r.title} ${r.body} ${r.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [replies, activeFolder, q]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: libraryKeys.replies(workspaceId) });

  const save = useMutation({
    mutationFn: async (r: Draft) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in required");
      const folder = r.folder?.trim() || null;
      const payload = {
        title: r.title?.trim() ?? "",
        body: r.body ?? "",
        folder,
        tags: r.tags ?? [],
        is_favorite: !!r.is_favorite,
      };
      if (r.id) {
        const { error } = await supabase.from("workspace_saved_replies").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workspace_saved_replies").insert({
          workspace_id: workspaceId, user_id: auth.user.id, ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { setEditing(null); toast.success("Saved"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_saved_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
  });

  const seedStarter = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in required");
      const rows = STARTER_PACK.map((s) => ({
        workspace_id: workspaceId,
        user_id: auth.user!.id,
        title: s.title,
        body: s.body,
        folder: s.folder,
        tags: [] as string[],
        is_favorite: !!s.is_favorite,
      }));
      const { error } = await supabase.from("workspace_saved_replies").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Starter pack added"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to seed"),
  });

  const toggleFav = async (r: SavedReply) => {
    await supabase.from("workspace_saved_replies").update({ is_favorite: !r.is_favorite }).eq("id", r.id);
    invalidate();
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  const folderTitle =
    activeFolder === ALL ? "All snippets"
    : activeFolder === FAV ? "Favorites"
    : activeFolder;

  return (
    <div className="h-full flex bg-background">
      {/* ========== Sidebar: folders ========== */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Library</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <FolderRow icon={FolderOpen} label="All snippets" count={replies.length}
            active={activeFolder === ALL} onClick={() => setActiveFolder(ALL)} />
          <FolderRow icon={Star} label="Favorites" count={replies.filter((r) => r.is_favorite).length}
            active={activeFolder === FAV} onClick={() => setActiveFolder(FAV)} starred />
          <div className="h-px bg-border my-2" />
          {folders.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-3">No folders yet.</div>
          )}
          {folders.map(([name, n]) => (
            <FolderRow key={name} icon={Folder} label={name} count={n}
              active={activeFolder === name} onClick={() => setActiveFolder(name)} />
          ))}
        </div>

        {/* Variables (collapsed by default — power-user only) */}
        <div className="border-t border-border">
          <button
            onClick={() => setShowVars((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {showVars ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Settings2 className="w-3.5 h-3.5" />
            Variables
          </button>
          {showVars && (
            <div className="px-2 pb-3 space-y-1.5 max-h-64 overflow-y-auto">
              <p className="text-[10px] text-muted-foreground px-1">
                Use as <code className="bg-muted px-1 rounded">{`{key}`}</code> inside a snippet.
              </p>
              <VariablesEditor workspaceId={workspaceId} fields={fields} onChange={() =>
                qc.invalidateQueries({ queryKey: libraryKeys.fields(workspaceId) })
              } />
            </div>
          )}
        </div>
      </aside>

      {/* ========== Main: items ========== */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <h2 className="font-display text-base truncate">{folderTitle}</h2>
          <span className="text-xs text-muted-foreground">{items.length}</span>
          <div className="relative ml-auto w-64 max-w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="pl-8 h-8 text-xs" />
          </div>
          <Button size="sm" className="h-8" onClick={() => setEditing({
            title: "", body: "", folder: activeFolder !== ALL && activeFolder !== FAV ? activeFolder : "",
            tags: [], is_favorite: false,
          })}>
            <Plus className="w-3.5 h-3.5 mr-1" />New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
              <FolderOpen className="w-8 h-8 opacity-40" />
              <div className="text-sm">
                {replies.length === 0 ? "Your library is empty." : "Empty folder."}
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {replies.length === 0 && (
                  <Button size="sm" onClick={() => seedStarter.mutate()} disabled={seedStarter.isPending}>
                    {seedStarter.isPending
                      ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                    Load starter pack
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing({
                  title: "", body: "", folder: activeFolder !== ALL && activeFolder !== FAV ? activeFolder : "",
                  tags: [], is_favorite: false,
                })}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Add snippet
                </Button>
              </div>
              {replies.length === 0 && (
                <p className="text-[11px] max-w-xs">
                  Adds 8 ready-to-use snippets in <span className="font-medium">Links</span>, <span className="font-medium">Greetings</span> and <span className="font-medium">Follow-ups</span>. Fill the link variables once in the Variables panel.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((r) => {
                const isLink = looksLikeUrl(r.body);
                return (
                  <div key={r.id} className="group rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-card/70 transition p-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className={`mt-0.5 w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                        isLink ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        {isLink ? <Link2 className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.title || "Untitled"}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 break-words">{r.body}</div>
                      </div>
                      <button onClick={() => toggleFav(r)} title="Favorite" className="shrink-0">
                        <Star className={`w-3.5 h-3.5 ${r.is_favorite ? "fill-amber-500 text-amber-500" : "text-muted-foreground/60"}`} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => copy(r.body)}>
                        <Copy className="w-3 h-3 mr-1" />Copy
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(r)}>
                        <Pencil className="w-3 h-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 ml-auto text-destructive"
                        onClick={() => { if (confirm(`Delete "${r.title}"?`)) del.mutate(r.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ========== Editor drawer ========== */}
      {editing && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setEditing(null)}>
          <div className="flex-1 bg-foreground/20 backdrop-blur-sm" />
          <div className="w-full max-w-md bg-card border-l border-border h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="font-display text-base">{editing.id ? "Edit snippet" : "New snippet"}</div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Close</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <Field label="Title">
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Pricing link" />
              </Field>
              <Field label="Content" hint="Paste a URL to make this a link snippet, or write text. Use {variables} from the sidebar.">
                <Textarea rows={6} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="https://...   or   Hi {name}, here's our pricing: {pricing_url}" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Folder">
                  <Input value={editing.folder ?? ""} onChange={(e) => setEditing({ ...editing, folder: e.target.value })} placeholder="e.g. Objections" list="lib-folders" />
                  <datalist id="lib-folders">
                    {folders.map(([f]) => <option key={f} value={f} />)}
                  </datalist>
                </Field>
                <Field label="Tags">
                  <Input
                    value={(editing.tags ?? []).join(", ")}
                    onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                    placeholder="comma, separated"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_favorite} onChange={(e) => setEditing({ ...editing, is_favorite: e.target.checked })} />
                Favorite
              </label>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => save.mutate(editing)} disabled={save.isPending || !editing.title?.trim() || !editing.body?.trim()}>
                {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderRow({ icon: Icon, label, count, active, onClick, starred }: {
  icon: typeof Folder; label: string; count: number; active: boolean; onClick: () => void; starred?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
        active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : ""} ${starred && active ? "fill-amber-500 text-amber-500" : ""}`} />
      <span className="truncate flex-1 text-left">{label}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ----- Variables editor (compact, inline) -----
function VariablesEditor({ workspaceId, fields, onChange }: {
  workspaceId: string; fields: LibraryField[]; onChange: () => void;
}) {
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = async (key: string, label: string, value: string) => {
    const existing = byKey.get(key);
    try {
      if (existing) {
        const { error } = await supabase.from("workspace_library_fields").update({ value }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workspace_library_fields").insert({
          workspace_id: workspaceId, key, label, type: "text", value, is_builtin: true,
        });
        if (error) throw error;
      }
      setDrafts((p) => { const n = { ...p }; delete n[key]; return n; });
      toast.success("Saved");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="space-y-1.5">
      {BUILTIN_FIELDS.map((b) => {
        const cur = drafts[b.key] ?? byKey.get(b.key)?.value ?? "";
        const dirty = drafts[b.key] !== undefined;
        return (
          <div key={b.key} className="space-y-0.5">
            <div className="flex items-center gap-1">
              <code className="text-[10px] text-muted-foreground">{`{${b.key}}`}</code>
              <span className="text-[10px] text-muted-foreground/70 truncate">— {b.label}</span>
              {dirty && (
                <button
                  onClick={() => save(b.key, b.label, cur)}
                  className="ml-auto text-[10px] text-primary hover:underline"
                >save</button>
              )}
            </div>
            <Input
              value={cur}
              onChange={(e) => setDrafts((p) => ({ ...p, [b.key]: e.target.value }))}
              placeholder={b.type === "link" ? "https://..." : ""}
              className="h-7 text-xs"
            />
          </div>
        );
      })}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Folder, Search, MessageSquare, Link2, Type, AlignLeft, Star } from "lucide-react";
import {
  expandTemplate, fetchLibraryFields, fetchSavedReplies, libraryKeys,
} from "@/lib/workspaceLibrary";

export default function ComposerInsertButton({ workspaceId, onInsert, disabled }: {
  workspaceId?: string;
  onInsert: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"replies" | "fields">("replies");
  const [q, setQ] = useState("");

  const { data: fields = [] } = useQuery({
    queryKey: libraryKeys.fields(workspaceId ?? ""),
    queryFn: () => fetchLibraryFields(workspaceId!),
    enabled: !!workspaceId && open,
  });
  const { data: replies = [] } = useQuery({
    queryKey: libraryKeys.replies(workspaceId ?? ""),
    queryFn: () => fetchSavedReplies(workspaceId!),
    enabled: !!workspaceId && open,
  });

  const fReplies = useMemo(() => replies.filter((r) => {
    if (!q) return true;
    return `${r.title} ${r.body} ${r.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase());
  }), [replies, q]);

  const fFields = useMemo(() => fields.filter((f) => {
    if (!q) return true;
    return `${f.label} ${f.key} ${f.value ?? ""}`.toLowerCase().includes(q.toLowerCase());
  }), [fields, q]);

  const insertReply = async (id: string, body: string) => {
    onInsert(expandTemplate(body, fields));
    setOpen(false);
    // best effort last_used_at update
    await supabase.from("workspace_saved_replies").update({ last_used_at: new Date().toISOString() }).eq("id", id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1.5 px-2.5 rounded-md text-xs font-medium"
          disabled={disabled}
          title="Insert from Library"
        >
          <Folder className="w-3.5 h-3.5" />
          Library
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[360px] p-0">
        <div className="border-b border-border flex items-center">
          {[
            { k: "replies", label: "Saved replies", icon: MessageSquare },
            { k: "fields", label: "Links & fields", icon: Link2 },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as "replies" | "fields")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 border-b-2 transition ${
                tab === t.k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "replies" ? "Search replies..." : "Search fields..."} className="pl-8 h-8 text-xs" autoFocus />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {!workspaceId ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Pick a client first.</div>
          ) : tab === "replies" ? (
            fReplies.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No saved replies. Add some in Library.</div>
            ) : fReplies.map((r) => (
              <button key={r.id} onClick={() => insertReply(r.id, r.body)} className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b border-border/40">
                <div className="flex items-center gap-1.5">
                  {r.is_favorite && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                  <span className="text-xs font-medium truncate">{r.title}</span>
                  {r.folder && <span className="text-[10px] text-muted-foreground ml-auto">{r.folder}</span>}
                </div>
                <div className="text-[11px] text-muted-foreground truncate mt-0.5">{r.body}</div>
              </button>
            ))
          ) : (
            fFields.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">No fields with values yet.</div>
            ) : fFields.map((f) => {
              const Icon = f.type === "link" ? Link2 : f.type === "long_text" ? AlignLeft : Type;
              const insertable = f.value ?? "";
              return (
                <button
                  key={f.id}
                  onClick={() => { if (insertable) { onInsert(insertable); setOpen(false); } }}
                  disabled={!insertable}
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b border-border/40 disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium truncate">{f.label}</span>
                    <code className="text-[10px] text-muted-foreground ml-auto">{`{${f.key}}`}</code>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">{insertable || "(empty)"}</div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, FileText, Paperclip, Download, Upload, StickyNote } from "lucide-react";
import type { WorkspaceContext } from "./WorkspaceLayout";

type Note = {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  updated_at: string;
};

type FileRow = {
  id: string;
  workspace_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const fmtSize = (n: number | null) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default function WorkspaceMaterials() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const wsId = workspace.id;
  const qc = useQueryClient();

  // ------- Notes -------
  const notesKey = useMemo(() => ["workspace-notes", wsId] as const, [wsId]);
  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: notesKey,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("workspace_notes")
        .select("id, workspace_id, title, body, updated_at")
        .eq("workspace_id", wsId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in first");
      const { error } = await supabase
        .from("workspace_notes")
        .insert({ workspace_id: wsId, title: "Untitled", body: "", created_by: auth.user.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add note"),
  });

  const saveNote = useMutation({
    mutationFn: async (n: { id: string; title: string; body: string }) => {
      const { error } = await supabase
        .from("workspace_notes")
        .update({ title: n.title, body: n.body })
        .eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey }),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspace_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note deleted");
      qc.invalidateQueries({ queryKey: notesKey });
    },
  });

  // ------- Files -------
  const filesKey = useMemo(() => ["workspace-files", wsId] as const, [wsId]);
  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: filesKey,
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from("workspace_files")
        .select("id, workspace_id, name, storage_path, mime_type, size_bytes, created_at")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    let ok = 0;
    let fail = 0;
    const { data: auth } = await supabase.auth.getUser();
    for (const file of Array.from(list)) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is over 25 MB - skipped`);
        fail++;
        continue;
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${wsId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("workspace-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        fail++;
        toast.error(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { error: insErr } = await supabase.from("workspace_files").insert({
        workspace_id: wsId,
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: auth.user?.id ?? null,
      });
      if (insErr) {
        fail++;
        toast.error(`${file.name}: ${insErr.message}`);
        continue;
      }
      ok++;
    }
    setUploading(false);
    if (ok) toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded`);
    if (fail && !ok) toast.error("Upload failed");
    qc.invalidateQueries({ queryKey: filesKey });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadFile = async (f: FileRow) => {
    const { data, error } = await supabase.storage
      .from("workspace-files")
      .createSignedUrl(f.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Could not generate download link");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = f.name;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const deleteFile = useMutation({
    mutationFn: async (f: FileRow) => {
      const { error: rmErr } = await supabase.storage.from("workspace-files").remove([f.storage_path]);
      if (rmErr) throw rmErr;
      const { error } = await supabase.from("workspace_files").delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File removed");
      qc.invalidateQueries({ queryKey: filesKey });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <Helmet>
        <title>Materials - {workspace.name}</title>
      </Helmet>

      <header>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Materials</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Notes, copy variations, contracts, photos - anything worth keeping for this client.
        </p>
      </header>

      {/* Notes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-primary" />
            <h3 className="font-display text-base font-semibold">Notes</h3>
            <span className="text-xs text-muted-foreground">{notes?.length ?? 0}</span>
          </div>
          <Button size="sm" onClick={() => addNote.mutate()} disabled={addNote.isPending}>
            {addNote.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            New note
          </Button>
        </div>

        {notesLoading && (
          <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        )}
        {!notesLoading && (notes ?? []).length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground text-center bg-card/30">
            No notes yet. Drop product notes, copy variants, briefs - anything you'd otherwise lose in chat.
          </Card>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {(notes ?? []).map((n) => (
            <NoteCard key={n.id} note={n} onSave={(t, b) => saveNote.mutate({ id: n.id, title: t, body: b })} onDelete={() => deleteNote.mutate(n.id)} />
          ))}
        </div>
      </section>

      {/* Files */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" />
            <h3 className="font-display text-base font-semibold">Files</h3>
            <span className="text-xs text-muted-foreground">{files?.length ?? 0}</span>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => uploadFiles(e.target.files)}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload
            </Button>
          </div>
        </div>

        {filesLoading && (
          <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        )}
        {!filesLoading && (files ?? []).length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground text-center bg-card/30">
            No files yet. Up to 25 MB per file.
          </Card>
        )}
        {(files ?? []).length > 0 && (
          <Card className="divide-y divide-border bg-card/30 overflow-hidden">
            {(files ?? []).map((f) => (
              <div key={f.id} className="p-3 flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {fmtSize(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                    {f.mime_type ? ` · ${f.mime_type}` : ""}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => downloadFile(f)} title="Download">
                  <Download className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteFile.mutate(f)} disabled={deleteFile.isPending} title="Delete">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function NoteCard({ note, onSave, onDelete }: { note: Note; onSave: (title: string, body: string) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const dirty = title !== note.title || body !== note.body;

  return (
    <Card className="p-3 space-y-2 bg-card/30">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => dirty && onSave(title, body)}
          placeholder="Title"
          className="h-8 text-sm font-medium border-transparent shadow-none px-1 focus-visible:border-input"
          maxLength={140}
        />
        <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => dirty && onSave(title, body)}
        placeholder="Drop copy variants, briefs, product notes…"
        rows={6}
        className="text-sm resize-y"
      />
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">Updated {new Date(note.updated_at).toLocaleString()}</div>
        {dirty && (
          <Button size="sm" variant="outline" onClick={() => onSave(title, body)}>Save</Button>
        )}
      </div>
    </Card>
  );
}

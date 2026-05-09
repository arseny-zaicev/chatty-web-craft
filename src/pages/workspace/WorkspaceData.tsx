import { useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database, Upload, Loader2, Trash2, Eye, FileText, AlertTriangle, CheckCircle2, XCircle, Copy as CopyIcon, Wand2, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  audienceKeys, fetchBatches, fetchBatchStats, fetchBatchRows,
  parseAudienceFile, detectPhoneColumn, uploadBatch, deleteBatch,
  type ParsedAudience,
} from "@/lib/audienceData";
import {
  prepProfileKeys, listPrepProfiles, applyDerivedVariables, validateRowAgainstProfile,
  type PrepProfile,
} from "@/lib/prepProfiles";
import type { WorkspaceContext } from "./WorkspaceLayout";

export default function WorkspaceData() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const qc = useQueryClient();
  const [openUpload, setOpenUpload] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const batchesQ = useQuery({
    queryKey: audienceKeys.batches(workspace?.id),
    queryFn: () => fetchBatches(workspace!.id),
    enabled: !!workspace,
  });

  const statsQ = useQuery({
    queryKey: audienceKeys.stats(workspace?.id),
    queryFn: () => fetchBatchStats(workspace!.id),
    enabled: !!workspace,
  });

  const statsMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof statsQ.data extends infer T ? T extends Array<infer R> ? () => R : never : never>>();
    (statsQ.data ?? []).forEach((s) => m.set(s.batch_id, s as never));
    return m as unknown as Map<string, NonNullable<typeof statsQ.data>[number]>;
  }, [statsQ.data]);

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteBatch(id),
    onSuccess: () => {
      toast.success("Batch deleted");
      qc.invalidateQueries({ queryKey: audienceKeys.batches(workspace?.id) });
      qc.invalidateQueries({ queryKey: audienceKeys.stats(workspace?.id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!workspace) {
    return <div className="p-6 text-sm text-muted-foreground">Pick a client from the sidebar.</div>;
  }

  return (
    <>
      <Helmet>
        <title>Data - {workspace.name}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <h1 className="font-display text-xl">Data</h1>
              <Badge variant="outline" className="text-[10px]">Internal · managers only</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Validated audience pool for this client. Upload once, then launch in parts from Launch &gt; Database batch.
              Clients never see this section or raw rows.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link to={`/ws/${workspace.slug}/data/profiles`}><Wand2 className="w-4 h-4 mr-1" />Prep Profiles</Link>
            </Button>
            <Button onClick={() => setOpenUpload(true)}>
              <Upload className="w-4 h-4 mr-1" /> Upload audience
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
          {batchesQ.isLoading && (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          )}
          {!batchesQ.isLoading && (batchesQ.data ?? []).length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No audience batches yet. Click <strong>Upload audience</strong> to add the first one.
            </div>
          )}
          {(batchesQ.data ?? []).map((b) => {
            const s = statsMap.get(b.id);
            return (
              <div key={b.id} className="p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{b.name}</span>
                    <Badge variant="outline" className="text-[10px]">{b.campaign_type}</Badge>
                    {b.country && <Badge variant="outline" className="text-[10px]">{b.country}</Badge>}
                    {b.copy_profile && <Badge variant="outline" className="text-[10px] text-muted-foreground">{b.copy_profile}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(b.created_at).toLocaleString()}
                    {b.source_filename && <> · {b.source_filename}</>}
                    {b.variable_schema.length > 0 && <> · vars: {b.variable_schema.join(", ")}</>}
                  </div>
                  {s && (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-7 gap-2 text-[11px]">
                      <Stat label="Total" value={s.total} />
                      <Stat label="Valid" value={s.valid} className="text-emerald-600" />
                      <Stat label="Invalid" value={s.invalid} className="text-amber-600" />
                      <Stat label="Duplicates" value={s.duplicates} className="text-amber-600" />
                      <Stat label="Unused" value={s.unused} className="text-primary font-semibold" />
                      <Stat label="Reserved" value={s.reserved} />
                      <Stat label="Used" value={s.used} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setActiveBatchId(b.id)}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm(`Delete batch "${b.name}" and all its rows?`)) removeMut.mutate(b.id);
                  }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <UploadDialog
        open={openUpload}
        onOpenChange={setOpenUpload}
        workspaceId={workspace.id}
        onUploaded={() => {
          qc.invalidateQueries({ queryKey: audienceKeys.batches(workspace.id) });
          qc.invalidateQueries({ queryKey: audienceKeys.stats(workspace.id) });
        }}
      />

      <BatchDetailSheet batchId={activeBatchId} onClose={() => setActiveBatchId(null)} />
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`font-mono ${className ?? ""}`}>{value.toLocaleString()}</div>
    </div>
  );
}

/* ---------- Upload dialog ---------- */

function UploadDialog({
  open, onOpenChange, workspaceId, onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedAudience | null>(null);
  const [phoneColumn, setPhoneColumn] = useState<string>("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [campaignType, setCampaignType] = useState<"marketing" | "utility">("marketing");
  const [copyProfile, setCopyProfile] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null); setParsed(null); setPhoneColumn("");
    setName(""); setCountry(""); setCampaignType("marketing");
    setCopyProfile(""); setNotes(""); setBusy(false);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setBusy(true);
    try {
      const p = await parseAudienceFile(f);
      setParsed(p);
      const guess = detectPhoneColumn(p.headers);
      if (guess) setPhoneColumn(guess);
      if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setBusy(false);
    }
  };

  const previewSummary = useMemo(() => {
    if (!parsed || !phoneColumn) return null;
    const seen = new Set<string>();
    let valid = 0, invalid = 0, dup = 0;
    for (const r of parsed.rows) {
      const v = r[phoneColumn];
      const cleaned = (v || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00+/, "");
      if (cleaned.length < 7 || cleaned.length > 15) { invalid++; continue; }
      if (seen.has(cleaned)) { dup++; continue; }
      seen.add(cleaned); valid++;
    }
    return { total: parsed.rows.length, valid, invalid, duplicates: dup };
  }, [parsed, phoneColumn]);

  const submit = async () => {
    if (!parsed || !phoneColumn || !name.trim()) {
      toast.error("Pick a file, phone column and a batch name");
      return;
    }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const result = await uploadBatch({
        workspaceId,
        userId: u.user.id,
        name: name.trim(),
        country: country.trim() || null,
        campaignType,
        copyProfile: copyProfile.trim() || null,
        notes: notes.trim() || null,
        parsed,
        phoneColumn,
        sourceFilename: file?.name ?? null,
      });
      toast.success(`Uploaded ${result.summary.valid} valid · ${result.summary.invalid} invalid · ${result.summary.duplicates} duplicates`);
      reset();
      onOpenChange(false);
      onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Upload audience batch</DialogTitle>
          <DialogDescription>
            Internal only. Validates phones, removes in-batch duplicates, and stores the audience for re-use across campaigns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">File (CSV / XLSX / TSV)</label>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full mt-1 text-sm"
            />
          </div>

          {parsed && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Batch name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UAE buyers - Oct 2026" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Phone column *</label>
                  <Select value={phoneColumn} onValueChange={setPhoneColumn}>
                    <SelectTrigger><SelectValue placeholder="Pick column" /></SelectTrigger>
                    <SelectContent>
                      {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Country (optional)</label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. AE, US" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Campaign type</label>
                  <Select value={campaignType} onValueChange={(v) => setCampaignType(v as "marketing" | "utility")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="utility">Utility</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Copy profile (optional)</label>
                  <Input value={copyProfile} onChange={(e) => setCopyProfile(e.target.value)} placeholder="e.g. cold-buyer-pitch-v1" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notes (optional)</label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              {previewSummary && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="font-medium mb-1">Preview</div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <Stat label="Total" value={previewSummary.total} />
                    <Stat label="Valid" value={previewSummary.valid} className="text-emerald-600" />
                    <Stat label="Invalid" value={previewSummary.invalid} className="text-amber-600" />
                    <Stat label="Duplicates" value={previewSummary.duplicates} className="text-amber-600" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Variables to be stored: {parsed.headers.filter((h) => h !== phoneColumn).join(", ") || "none"}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !parsed || !phoneColumn || !name.trim()}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            Upload batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Batch detail sheet ---------- */

function BatchDetailSheet({ batchId, onClose }: { batchId: string | null; onClose: () => void }) {
  const open = !!batchId;
  const rowsQ = useQuery({
    queryKey: audienceKeys.rows(batchId ?? ""),
    queryFn: () => fetchBatchRows(batchId!),
    enabled: open,
  });

  const validIcon = (s: string) => s === "valid" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> :
    s === "duplicate" ? <CopyIcon className="w-3.5 h-3.5 text-amber-600" /> :
    <XCircle className="w-3.5 h-3.5 text-amber-600" />;

  const usageColor = (s: string) =>
    s === "used" ? "text-muted-foreground" :
    s === "reserved" || s === "scheduled" ? "text-amber-600" :
    "text-emerald-600";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Batch rows preview</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {rowsQ.isLoading && <div className="flex justify-center p-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
          {rowsQ.data && (
            <>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Showing first {rowsQ.data.length} rows
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-[70vh] overflow-y-auto">
                {rowsQ.data.map((r) => (
                  <div key={r.id} className="p-2 text-xs flex items-center gap-2">
                    {validIcon(r.validation_status)}
                    <span className="font-mono flex-1 truncate">
                      {r.validation_status === "valid" ? `+${r.phone}` : r.phone.replace(/^__\w+__:/, "")}
                    </span>
                    <span className={`text-[10px] uppercase ${usageColor(r.usage_status)}`}>{r.usage_status}</span>
                  </div>
                ))}
                {rowsQ.data.length === 0 && (
                  <div className="p-6 text-sm text-muted-foreground text-center flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> No rows in this batch
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

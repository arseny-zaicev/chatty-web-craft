import { useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database, Upload, Loader2, Trash2, Eye, FileText, AlertTriangle, CheckCircle2, XCircle, Copy as CopyIcon, Wand2, ShieldCheck, ShieldAlert, RefreshCw, ClipboardCopy,
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
  prepProfileKeys, listPrepProfiles, applyDerivedVariables, applyColumnMapping,
  validateRowAgainstProfile, renderSampleMessage,
  buildPrepPrompt, buildFallbackPrompt,
  type PrepProfile,
} from "@/lib/prepProfiles";
import { PREP_PRESETS, buildPresetPrompt, type PrepPreset, type StaticValues, NAME_FALLBACK_PHRASES, VARIABLE_KIND_EXPLAINER } from "@/lib/prepPresets";
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
            <Button variant="ghost" size="icon" title="Refresh"
              onClick={() => {
                qc.invalidateQueries({ queryKey: audienceKeys.batches(workspace.id) });
                qc.invalidateQueries({ queryKey: audienceKeys.stats(workspace.id) });
                qc.invalidateQueries({ queryKey: prepProfileKeys.list(workspace.id) });
              }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button asChild variant="outline">
              <Link to={`/ws/${workspace.slug}/data/profiles`}><Wand2 className="w-4 h-4 mr-1" />Prep Profiles</Link>
            </Button>
            <Button onClick={() => setOpenUpload(true)}>
              <Upload className="w-4 h-4 mr-1" /> Upload audience (fallback)
            </Button>
          </div>
        </div>

        <PresetsSection workspaceName={workspace.name} workspaceId={workspace.id} />

        <PrepPromptsSection workspaceName={workspace.name} workspaceId={workspace.id} workspaceSlug={workspace.slug} />

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
                    {b.is_launch_ready ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600"><ShieldCheck className="w-3 h-3 mr-1" />Launch-ready</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600"><ShieldAlert className="w-3 h-3 mr-1" />No prep profile</Badge>
                    )}
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

function PresetsSection({
  workspaceName, workspaceId,
}: { workspaceName: string; workspaceId: string }) {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<PrepPreset | null>(null);
  const [creating, setCreating] = useState<PrepPreset | null>(null);
  const [batchName, setBatchName] = useState("");
  const [batchCountry, setBatchCountry] = useState("");
  const [batchAudience, setBatchAudience] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [batchNotes, setBatchNotes] = useState("");
  const [staticValues, setStaticValues] = useState<StaticValues>({});
  const [busy, setBusy] = useState(false);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked - select text manually");
    }
  };

  const buildBatchName = (country: string, audience: string) => {
    const date = new Date().toISOString().slice(0, 10);
    const c = country.trim().toUpperCase() || "ALL";
    const a = audience.trim() || "AUDIENCE";
    return `${date} | ${c} | ${a}`;
  };

  const startCreate = (p: PrepPreset) => {
    setCreating(p);
    setBatchCountry("");
    setBatchAudience("");
    setBatchNotes("");
    setNameTouched(false);
    setBatchName(buildBatchName("", ""));
    setCreatedBatchId(null);
    // Pre-fill campaign_static fields with empty strings so operator sees inputs.
    const initial: StaticValues = {};
    for (const v of p.variables) if (v.kind === "campaign_static") initial[v.key] = "";
    setStaticValues(initial);
  };

  // Validate every campaign_static field. Returns { ok, issues: { var_key: reason } }
  const staticIssues = useMemo(() => {
    if (!creating) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    const banned = new Set(NAME_FALLBACK_PHRASES.map((s) => s.toLowerCase()));
    for (const v of creating.variables) {
      if (v.kind !== "campaign_static") continue;
      const raw = (staticValues[v.key] ?? "").trim();
      if (!raw) { out[v.key] = "Required - paste exact copy from Materials"; continue; }
      if (raw.length < 5) { out[v.key] = "Too short - paste the full sentence"; continue; }
      if (banned.has(raw.toLowerCase())) { out[v.key] = `"${raw}" is a name fallback, not campaign copy`; continue; }
      if (/\{\{?[^}]+\}?\}/.test(raw)) { out[v.key] = "Looks like an unresolved {placeholder}"; continue; }
    }
    return out;
  }, [creating, staticValues]);
  const staticOk = Object.keys(staticIssues).length === 0;

  const onCountryChange = (val: string) => {
    setBatchCountry(val);
    if (!nameTouched && !createdBatchId) setBatchName(buildBatchName(val, batchAudience));
  };

  const onAudienceChange = (val: string) => {
    setBatchAudience(val);
    if (!nameTouched && !createdBatchId) setBatchName(buildBatchName(batchCountry, val));
  };

  const onBatchNameChange = (val: string) => {
    setBatchName(val);
    setNameTouched(true);
  };

  const submitBatch = async () => {
    if (!creating || !batchName.trim()) { toast.error("Batch name required"); return; }
    if (!staticOk) { toast.error("Fill in every same-for-everyone variable below"); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      // Persist staticValues so Launch QA can verify each row matches.
      // Stored in notes field as a header line (no schema change needed).
      const staticHeader = Object.keys(staticValues).length > 0
        ? `__static_values__=${JSON.stringify(staticValues)}\n`
        : "";
      const finalNotes = `${staticHeader}${batchNotes.trim()}`.trim() || null;
      const { data, error } = await (supabase.from("audience_batches") as any).insert({
        workspace_id: workspaceId,
        user_id: u.user.id,
        name: batchName.trim(),
        country: batchCountry.trim() || null,
        campaign_type: creating.campaignType,
        copy_profile: creating.id,
        notes: finalNotes,
        variable_schema: creating.variables.map((v) => v.key),
        source_filename: null,
        prep_profile_id: null,
        is_launch_ready: false,
        derived_variables_preview: [],
        column_mapping: {},
      }).select("id").single();
      if (error || !data) throw error ?? new Error("Failed to create batch");
      setCreatedBatchId(data.id);
      toast.success("Batch created - copy the prompt below");
      qc.invalidateQueries({ queryKey: audienceKeys.batches(workspaceId) });
      qc.invalidateQueries({ queryKey: audienceKeys.stats(workspaceId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create batch");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4 text-primary" />
        <h2 className="font-medium text-sm">Ingestion presets</h2>
        <Badge variant="outline" className="text-[10px]">primary workflow</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Pick a preset → create the empty batch → copy its prompt → run it in Codex with the raw data. Codex inserts validated rows into <code>public.audience_rows</code> under the batch_id, then refresh below and launch.
      </p>
      <pre className="text-[11px] bg-muted/40 border border-border rounded-md p-2 mb-3 whitespace-pre-wrap font-mono text-muted-foreground">{VARIABLE_KIND_EXPLAINER}</pre>

      <div className="grid gap-2 sm:grid-cols-2">
        {PREP_PRESETS.map((p) => (
          <div key={p.id} className={`rounded-md border p-3 bg-background/40 ${p.isRecommended ? "border-primary/50" : "border-border"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{p.name}</span>
              <Badge variant="outline" className="text-[10px]">{p.campaignType}</Badge>
              {p.isRecommended && <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30" variant="outline">Recommended</Badge>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{p.blurb}</div>
            <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
              {p.variables.map((v) => (
                <div key={v.key}>
                  <span className="font-mono">{v.key}</span>{" "}
                  {v.kind === "per_row"
                    ? <span className="text-emerald-600">[per row]</span>
                    : <span className="text-rose-600">[same for everyone]</span>}{" "}
                  <span className="opacity-70">- {v.description}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button size="sm" variant="ghost" onClick={() => setViewing(p)}>
                <Eye className="w-3.5 h-3.5 mr-1" /> Preview prompt
              </Button>
              <Button size="sm" onClick={() => startCreate(p)}>
                <Database className="w-3.5 h-3.5 mr-1" /> Create batch &amp; get prompt
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview-only dialog (no batch yet) */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.name} - prompt preview</DialogTitle>
            <DialogDescription>
              Preview only. To actually run it, close this and click <strong>Create batch &amp; get prompt</strong> so Codex inserts rows under a real batch_id.
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <pre className="text-xs bg-muted/40 rounded-md p-3 whitespace-pre-wrap font-mono">
{buildPresetPrompt(viewing, { workspaceName, workspaceId })}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      {/* Create-batch dialog */}
      <Dialog open={!!creating} onOpenChange={(o) => { if (!o) { setCreating(null); setCreatedBatchId(null); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating?.name} - create batch</DialogTitle>
            <DialogDescription>
              Step 1: create the empty batch. Step 2: copy the generated prompt (with the batch_id baked in) and run it in Codex.
            </DialogDescription>
          </DialogHeader>
          {creating && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Country (optional)</label>
                  <Input value={batchCountry} onChange={(e) => onCountryChange(e.target.value)} placeholder="e.g. AE, US, ALL" disabled={!!createdBatchId} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Audience *</label>
                  <Input value={batchAudience} onChange={(e) => onAudienceChange(e.target.value)} placeholder="e.g. cold leads Q2, no-shows, churned" disabled={!!createdBatchId} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>Batch name *</span>
                    <span className="text-[10px] text-muted-foreground/70">format: DATE | COUNTRY | AUDIENCE (auto-fills from fields above)</span>
                  </label>
                  <Input value={batchName} onChange={(e) => onBatchNameChange(e.target.value)} disabled={!!createdBatchId} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Campaign type</label>
                  <Input value={creating.campaignType} disabled />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Template variant</label>
                  <Input value={creating.name} disabled />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notes (optional)</label>
                  <Textarea rows={2} value={batchNotes} onChange={(e) => setBatchNotes(e.target.value)} disabled={!!createdBatchId} />
                </div>
              </div>

              {/* Variable explainer + campaign_static inputs */}
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium">Variables</div>
                <pre className="text-[11px] bg-background/50 border border-border rounded-md p-2 whitespace-pre-wrap font-mono text-muted-foreground">{VARIABLE_KIND_EXPLAINER}</pre>
                <div className="space-y-2">
                  {creating.variables.map((v) => {
                    if (v.kind === "per_row") {
                      return (
                        <div key={v.key} className="text-[11px] text-muted-foreground">
                          <span className="font-mono text-foreground">{v.key}</span>{" "}
                          <span className="text-emerald-600">[per row]</span>{" "}
                          - {v.description} (auto from <code>{v.source}</code>{v.fallback ? `, fallback "${v.fallback}"` : ""})
                        </div>
                      );
                    }
                    const issue = staticIssues[v.key];
                    return (
                      <div key={v.key} className="space-y-1">
                        <label className="text-[11px] flex items-center gap-2 flex-wrap">
                          <span className="font-mono">{v.key}</span>
                          <span className="text-rose-600">[same for everyone]</span>
                          <span className="text-muted-foreground">- {v.description}</span>
                        </label>
                        <Textarea
                          rows={3}
                          placeholder={`Paste exact ${v.key} text from Materials, e.g.\n${v.example}`}
                          value={staticValues[v.key] ?? ""}
                          onChange={(e) => setStaticValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          disabled={!!createdBatchId}
                          className={issue ? "border-amber-500" : ""}
                        />
                        {issue && (
                          <div className="text-[11px] text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {issue}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {!createdBatchId && (
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreating(null)}>Cancel</Button>
                  <Button onClick={submitBatch} disabled={busy || !batchName.trim() || !staticOk}>
                    {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Database className="w-4 h-4 mr-1" />}
                    Create batch
                  </Button>
                </DialogFooter>
              )}

              {createdBatchId && (
                <>
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Batch created. batch_id: <code className="font-mono">{createdBatchId}</code>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Codex prompt (batch_id baked in)</div>
                    <pre className="text-xs bg-muted/40 rounded-md p-3 whitespace-pre-wrap font-mono max-h-[40vh] overflow-y-auto">
{buildPresetPrompt(creating, { workspaceName, workspaceId, batchId: createdBatchId, staticValues })}
                    </pre>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" disabled={pulling} onClick={() => { setCreating(null); setCreatedBatchId(null); }}>Done</Button>
                    <Button variant="outline" disabled={pulling || !createdBatchId} onClick={async () => {
                      if (!createdBatchId) return;
                      setPulling(true);
                      const tid = toast.loading("Pulling rows from your Supabase... (can take 30-60s for big batches)");
                      try {
                        // Direct fetch so we can read the JSON error body (functions.invoke hides it).
                        const { data: { session } } = await supabase.auth.getSession();
                        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-audience-from-personal`;
                        const res = await fetch(url, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                            "Authorization": `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                          },
                          body: JSON.stringify({ batch_id: createdBatchId }),
                        });
                        const json = await res.json().catch(() => ({}));
                        toast.dismiss(tid);
                        if (!res.ok) {
                          toast.error(`Pull failed: ${json?.error ?? `HTTP ${res.status}`}`);
                          return;
                        }
                        toast.success(`Imported ${json?.inserted ?? 0} rows from your Supabase`);
                        qc.invalidateQueries({ queryKey: audienceKeys.batches(workspaceId) });
                        qc.invalidateQueries({ queryKey: audienceKeys.stats(workspaceId) });
                      } catch (e: any) {
                        toast.dismiss(tid);
                        toast.error(`Pull failed: ${e?.message ?? String(e)}`);
                      } finally {
                        setPulling(false);
                      }
                    }}>
                      {pulling
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Pulling...</>
                        : <><Database className="w-3.5 h-3.5 mr-1" /> Pull from my Supabase</>}
                    </Button>
                    <Button disabled={pulling} onClick={() => copy(buildPresetPrompt(creating, { workspaceName, workspaceId, batchId: createdBatchId, staticValues }), `${creating.name} prompt`)}>
                      <ClipboardCopy className="w-3.5 h-3.5 mr-1" /> Copy prompt
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrepPromptsSection({
  workspaceName, workspaceId, workspaceSlug,
}: { workspaceName: string; workspaceId: string; workspaceSlug: string }) {
  const qc = useQueryClient();
  const profilesQ = useQuery({
    queryKey: prepProfileKeys.list(workspaceId),
    queryFn: () => listPrepProfiles(workspaceId),
  });
  const profiles = profilesQ.data ?? [];
  const [viewing, setViewing] = useState<PrepProfile | null>(null);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked - select text manually");
    }
  };

  if (profiles.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card/30 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-medium text-sm">Custom prep profiles</h2>
        <Badge variant="outline" className="text-[10px]">advanced</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Optional: hand-built recipes for edge cases the presets above don't cover. Manage them in <Link to={`/ws/${workspaceSlug}/data/profiles`} className="text-primary underline">Prep Profiles</Link>.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {profiles.map((p) => (
          <div key={p.id} className="rounded-md border border-border p-3 bg-background/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{p.name}</span>
              <Badge variant="outline" className="text-[10px]">{p.campaign_type}</Badge>
              {p.template_label && <Badge variant="outline" className="text-[10px] text-muted-foreground">{p.template_label}</Badge>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              required: {p.required_fields.join(", ") || "none"} · derives: {p.derived_variables.map((d) => d.key).join(", ") || "none"}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button size="sm" variant="outline" onClick={() => setViewing(p)}>
                <Eye className="w-3.5 h-3.5 mr-1" /> View prompt
              </Button>
              <Button size="sm" variant="ghost"
                onClick={() => copy(buildPrepPrompt(p, { workspaceName, workspaceId }), "Prep prompt")}>
                <ClipboardCopy className="w-3.5 h-3.5 mr-1" /> Copy prompt
              </Button>
              <Button size="sm" variant="ghost"
                onClick={() => copy(buildFallbackPrompt(p), "Fallback prompt")}>
                <ClipboardCopy className="w-3.5 h-3.5 mr-1" /> Copy fallback
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prompt generated from "{viewing?.name}"</DialogTitle>
            <DialogDescription>
              Built from this profile's required fields, derived variables, validation rules, fallbacks, and sample message body.
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <pre className="text-xs bg-muted/40 rounded-md p-3 whitespace-pre-wrap font-mono">
{buildPrepPrompt(viewing, { workspaceName, workspaceId })}
            </pre>
          )}
          <DialogFooter>
            {viewing && (
              <Button onClick={() => copy(buildPrepPrompt(viewing, { workspaceName, workspaceId }), "Prep prompt")}>
                <ClipboardCopy className="w-3.5 h-3.5 mr-1" /> Copy prompt
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [prepProfileId, setPrepProfileId] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const profilesQ = useQuery({
    queryKey: prepProfileKeys.list(workspaceId),
    queryFn: () => listPrepProfiles(workspaceId),
    enabled: open,
  });
  const prepProfile: PrepProfile | null = (profilesQ.data ?? []).find((p) => p.id === prepProfileId) ?? null;

  const reset = () => {
    setFile(null); setParsed(null); setPhoneColumn("");
    setName(""); setCountry(""); setCampaignType("marketing");
    setCopyProfile(""); setNotes(""); setBusy(false); setPrepProfileId("");
    setMapping({});
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

  // Auto-suggest column mapping (case-insensitive exact match) when profile or headers change.
  const expectedFields = useMemo(
    () => prepProfile ? Array.from(new Set([...prepProfile.required_fields, ...prepProfile.optional_fields])) : [],
    [prepProfile],
  );
  const sourceColumns = useMemo(
    () => parsed ? parsed.headers.filter((h) => h !== phoneColumn) : [],
    [parsed, phoneColumn],
  );
  useMemo(() => {
    if (!parsed || !prepProfile) return;
    const next: Record<string, string> = { ...mapping };
    let changed = false;
    for (const src of sourceColumns) {
      if (next[src]) continue;
      const lower = src.toLowerCase().replace(/[\s_-]+/g, "");
      const hit = expectedFields.find((f) => f.toLowerCase().replace(/[\s_-]+/g, "") === lower);
      if (hit) { next[src] = hit; changed = true; }
    }
    if (changed) setMapping(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.headers.join("|"), phoneColumn, prepProfile?.id]);

  const previewSummary = useMemo(() => {
    if (!parsed || !phoneColumn) return null;
    const seen = new Set<string>();
    let valid = 0, invalid = 0, dup = 0;
    for (const r of parsed.rows) {
      const v = r[phoneColumn];
      const cleaned = (v || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00+/, "");
      if (cleaned.length < 7 || cleaned.length > 15) { invalid++; continue; }
      if (seen.has(cleaned)) { dup++; continue; }
      seen.add(cleaned);
      if (prepProfile) {
        const raw: Record<string, string> = {};
        for (const h of parsed.headers) if (h !== phoneColumn) raw[h] = r[h] ?? "";
        const mapped = applyColumnMapping(raw, mapping);
        const vr = validateRowAgainstProfile(prepProfile, mapped);
        if (!vr.ok) { invalid++; continue; }
      }
      valid++;
    }
    return { total: parsed.rows.length, valid, invalid, duplicates: dup };
  }, [parsed, phoneColumn, prepProfile, mapping]);

  const sampleRender = useMemo(() => {
    if (!parsed || !prepProfile || parsed.rows.length === 0) return null;
    const r = parsed.rows[0];
    const raw: Record<string, string> = {};
    for (const h of parsed.headers) if (h !== phoneColumn) raw[h] = r[h] ?? "";
    const mapped = applyColumnMapping(raw, mapping);
    return {
      derived: applyDerivedVariables(prepProfile, mapped),
      message: renderSampleMessage(prepProfile, mapped),
    };
  }, [parsed, prepProfile, phoneColumn, mapping]);

  const submit = async () => {
    if (!parsed || !phoneColumn || !name.trim()) {
      toast.error("Pick a file, phone column and a batch name");
      return;
    }
    if (!prepProfile) {
      toast.error("Pick a prep profile (required for launch readiness)");
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
        prepProfile,
        columnMapping: mapping,
      });
      toast.success(`Uploaded ${result.summary.valid} valid · ${result.summary.invalid} invalid · ${result.summary.duplicates} duplicates${result.isLaunchReady ? " · launch-ready" : ""}`);
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
            <label className="text-xs text-muted-foreground">Prep Profile *</label>
            <Select value={prepProfileId} onValueChange={setPrepProfileId}>
              <SelectTrigger><SelectValue placeholder={(profilesQ.data?.length ?? 0) === 0 ? "Create a profile first in Prep Profiles" : "Pick a prep profile"} /></SelectTrigger>
              <SelectContent>
                {(profilesQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.campaign_type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

              {prepProfile && sourceColumns.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="text-sm font-medium">Map source columns to expected fields</div>
                  <p className="text-xs text-muted-foreground">
                    Auto-matched by name where possible. Override below. Unmapped columns are kept as-is in <code>payload</code>.
                  </p>
                  <div className="grid gap-1.5">
                    {sourceColumns.map((src) => (
                      <div key={src} className="grid grid-cols-12 gap-2 items-center">
                        <code className="col-span-5 text-xs truncate" title={src}>{src}</code>
                        <span className="col-span-1 text-center text-muted-foreground text-xs">→</span>
                        <Select value={mapping[src] ?? "__same"} onValueChange={(v) => {
                          const next = { ...mapping };
                          if (v === "__same") delete next[src]; else next[src] = v;
                          setMapping(next);
                        }}>
                          <SelectTrigger className="col-span-6 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__same">(keep as &quot;{src}&quot;)</SelectItem>
                            {expectedFields.map((f) => {
                              const required = prepProfile.required_fields.includes(f);
                              return <SelectItem key={f} value={f}>{f}{required ? " *" : ""}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const usedTargets = new Set(Object.values(mapping));
                    const missing = prepProfile.required_fields.filter((f) => !usedTargets.has(f) && !sourceColumns.includes(f));
                    if (missing.length === 0) return null;
                    return (
                      <div className="text-xs text-amber-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Missing required fields: {missing.join(", ")}
                      </div>
                    );
                  })()}
                </div>
              )}

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
                    Variables to be stored: {parsed.headers.filter((h) => h !== phoneColumn).map((h) => mapping[h] && mapping[h] !== "" ? mapping[h] : h).join(", ") || "none"}
                  </div>
                </div>
              )}

              {sampleRender && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> First-row rendered preview</div>
                  <div className="font-mono text-xs space-y-0.5">
                    {Object.entries(sampleRender.derived).map(([k, v]) => (
                      <div key={k}><span className="text-primary">{k}</span> = {v || <em className="text-muted-foreground">(empty)</em>}</div>
                    ))}
                  </div>
                  {sampleRender.message != null && (
                    <div className="rounded-md bg-background border border-border p-2 whitespace-pre-wrap text-xs">
                      {sampleRender.message || <em className="text-muted-foreground">(empty render — add a sample message body to the prep profile)</em>}
                    </div>
                  )}
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

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Upload, Loader2, Wand2, CheckCircle2, AlertTriangle, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  audienceKeys, parseAudienceFile, detectPhoneColumn, uploadBatch, type ParsedAudience,
} from "@/lib/audienceData";
import { prepProfileKeys, listPrepProfiles, type PrepProfile } from "@/lib/prepProfiles";

type AnalyzeResult = {
  column_mapping: Record<string, string>;
  static_values: Record<string, string>;
  matched_template_id: string | null;
  matched_template_name: string | null;
  matched_template_confidence: number;
  suggested_name: string;
  country_distribution: Record<string, number>;
  warnings: string[];
  notes: string;
};

type Step = "input" | "preview";

export function SmartUploadDialog({
  open,
  onOpenChange,
  workspaceId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  onUploaded: () => void;
}) {
  const qc = useQueryClient();
  const profilesQ = useQuery({
    queryKey: prepProfileKeys.list(workspaceId),
    queryFn: () => listPrepProfiles(workspaceId),
    enabled: open,
  });

  const [step, setStep] = useState<Step>("input");
  const [profileId, setProfileId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedAudience | null>(null);
  const [pastedCopy, setPastedCopy] = useState("");
  const [hint, setHint] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [phoneColumn, setPhoneColumn] = useState<string>("");
  // Editable mapping (sourceColumn -> profile field)
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const profile: PrepProfile | null = useMemo(() => {
    return (profilesQ.data ?? []).find((p) => p.id === profileId) ?? null;
  }, [profilesQ.data, profileId]);

  const reset = () => {
    setStep("input");
    setProfileId("");
    setFile(null);
    setParsed(null);
    setPastedCopy("");
    setHint("");
    setResult(null);
    setName("");
    setCountry("");
    setPhoneColumn("");
    setMapping({});
  };

  const handleFile = async (f: File) => {
    setFile(f);
    try {
      const p = await parseAudienceFile(f);
      setParsed(p);
      const detected = detectPhoneColumn(p.headers);
      if (detected) setPhoneColumn(detected);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
      setFile(null);
      setParsed(null);
    }
  };

  const analyze = async () => {
    if (!parsed || parsed.rows.length === 0) {
      toast.error("Drop a file with at least 1 row");
      return;
    }
    setAnalyzing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audience-ai-prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          workspace_id: workspaceId,
          prep_profile_id: profileId || null,
          parsed_rows: parsed.rows.slice(0, 150),
          all_headers: parsed.headers,
          user_hint: hint.trim() || null,
          pasted_copy: pastedCopy.trim() || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        toast.error(json?.error ?? "AI analysis failed");
        return;
      }
      const r = json as AnalyzeResult;
      setResult(r);
      setName(r.suggested_name);
      // Detect dominant country from distribution
      const top = Object.entries(r.country_distribution ?? {}).sort((a, b) => b[1] - a[1])[0];
      if (top && top[0] !== "??") setCountry(top[0]);
      // Seed mapping (only entries where source column exists)
      const seeded: Record<string, string> = {};
      for (const [src, dest] of Object.entries(r.column_mapping ?? {})) {
        if (parsed.headers.includes(src) && dest) seeded[src] = dest;
      }
      setMapping(seeded);
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const confirm = async () => {
    if (!parsed || !phoneColumn || !name.trim() || !profile) {
      toast.error("Pick a prep profile, phone column and a name");
      return;
    }
    setConfirming(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const r = await uploadBatch({
        workspaceId,
        userId: u.user.id,
        name: name.trim(),
        country: country.trim() || null,
        campaignType: profile.campaign_type,
        copyProfile: result?.matched_template_name ?? profile.template_label ?? null,
        notes: buildNotes(result, hint),
        parsed,
        phoneColumn,
        sourceFilename: file?.name ?? null,
        prepProfile: profile,
        columnMapping: mapping,
      });
      toast.success(`Saved ${r.summary.valid} valid · ${r.summary.invalid} invalid · ${r.summary.duplicates} dupes`);
      qc.invalidateQueries({ queryKey: audienceKeys.batches(workspaceId) });
      qc.invalidateQueries({ queryKey: audienceKeys.stats(workspaceId) });
      reset();
      onOpenChange(false);
      onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  };

  // ---- input step
  const sourceColumns = parsed ? parsed.headers.filter((h) => h !== phoneColumn) : [];
  const expectedFields = profile
    ? Array.from(new Set([...profile.required_fields, ...profile.optional_fields]))
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Smart upload (AI)
          </DialogTitle>
          <DialogDescription>
            Drop a file, optionally paste the message copy, AI proposes a mapping. You always confirm before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Prep profile *</label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger>
                  <SelectValue placeholder={(profilesQ.data?.length ?? 0) === 0 ? "Create a profile first in Prep Profiles" : "Pick a prep profile"} />
                </SelectTrigger>
                <SelectContent>
                  {(profilesQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.campaign_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profile?.template_label && (
                <p className="text-[11px] text-muted-foreground mt-1">Template: <code>{profile.template_label}</code></p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">File (CSV / XLSX / TSV)</label>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                className="block w-full mt-1 text-sm"
              />
              {parsed && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {parsed.rows.length} rows · {parsed.headers.length} columns
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Message copy (optional)</label>
              <Textarea
                rows={3}
                value={pastedCopy}
                onChange={(e) => setPastedCopy(e.target.value)}
                placeholder="Paste the WhatsApp message body — AI will try to match it to one of your approved templates."
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Extra hint (optional)</label>
              <Input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="e.g. only AE numbers, dedupe vs last week"
              />
            </div>

            <div className="rounded-md bg-muted/30 border border-border p-2 text-[11px] text-muted-foreground">
              <Wand2 className="w-3 h-3 inline mr-1" />
              AI gets the first 30 rows + headers + your hint. Phones, dedup and validation happen locally.
            </div>
          </div>
        )}

        {step === "preview" && result && parsed && profile && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> AI plan
              </div>
              <p className="text-xs text-muted-foreground">{result.notes}</p>
              {result.matched_template_name && (
                <p className="text-xs">
                  Template match: <code>{result.matched_template_name}</code>{" "}
                  <span className="text-muted-foreground">({Math.round(result.matched_template_confidence * 100)}%)</span>
                </p>
              )}
              {Object.keys(result.country_distribution ?? {}).length > 0 && (
                <p className="text-xs">
                  Countries: {Object.entries(result.country_distribution).slice(0, 5).map(([c, n]) => `${c} ${n}`).join(" · ")}
                </p>
              )}
              {result.warnings.length > 0 && (
                <ul className="text-xs text-amber-600 space-y-0.5 mt-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Audience name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
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
                <label className="text-xs text-muted-foreground">Country</label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="AE" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <div className="h-9 flex items-center"><Badge variant="outline" className="text-[10px]">{profile.campaign_type}</Badge></div>
              </div>
            </div>

            {sourceColumns.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Column mapping (you can edit)
                </div>
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
                            const required = profile.required_fields.includes(f);
                            return <SelectItem key={f} value={f}>{f}{required ? " *" : ""}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "input" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={analyze} disabled={analyzing || !parsed || !profileId}>
                {analyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Analyze with AI
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={() => setStep("input")}>← Back</Button>
              <Button onClick={confirm} disabled={confirming || !phoneColumn || !name.trim()}>
                {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Confirm &amp; save
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildNotes(result: AnalyzeResult | null, hint: string): string | null {
  const parts: string[] = [];
  if (hint.trim()) parts.push(`hint: ${hint.trim()}`);
  if (result?.matched_template_name) {
    parts.push(`ai-template: ${result.matched_template_name} (${Math.round(result.matched_template_confidence * 100)}%)`);
  }
  if (result && Object.keys(result.static_values).length > 0) {
    parts.push(`__static_values__=${JSON.stringify(result.static_values)}`);
  }
  return parts.join("\n") || null;
}

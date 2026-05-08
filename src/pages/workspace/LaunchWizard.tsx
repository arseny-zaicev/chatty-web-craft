import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Play, RefreshCw, Rocket, Users, FileText, Phone, Clock, Zap, Timer,
  Upload, MessagesSquare, Bookmark, Eye, AlertTriangle, Save, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  fetchLaunchEssentials, fetchConversationsLite,
  groupLogicalTemplates, parseCsv, detectColumns, applyMapping,
  geoFromPhone, buildCampaignName, renderTemplateBody, groupNumbersByCountry,
  loadMapping, saveMapping, listSavedAudiences, saveAudience, deleteSavedAudience,
  type Recipient, type LogicalTemplate, type CampaignType, type Template, type SavedAudience,
} from "@/lib/launchData";
import type { WorkspaceContext } from "./WorkspaceLayout";

const CTA_PRESETS = ["Guide", "Call", "Free material", "Audit", "Case study", "Other"] as const;


const launchKeys = {
  essentials: (wid?: string) => ["launch", "essentials", wid ?? "all"] as const,
  chats: (wid?: string) => ["launch", "chats", wid ?? "all"] as const,
};

const TYPE_PRESETS: Record<CampaignType, { label: string; mode: "Blast" | "Utility"; delayMin: number; delayMax: number; perNumber: number; routing: boolean; templateCategory: "marketing" | "utility" }> = {
  marketing: { label: "Marketing Blast", mode: "Blast", delayMin: 0, delayMax: 0, perNumber: 1000, routing: false, templateCategory: "marketing" },
  utility: { label: "Utility Paced", mode: "Utility", delayMin: 60, delayMax: 120, perNumber: 200, routing: true, templateCategory: "utility" },
};

const UTILITY_MIN_DELAY = 60;

export default function LaunchWizard() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: launchKeys.essentials(workspace?.id),
    queryFn: () => fetchLaunchEssentials(workspace?.id),
    enabled: Boolean(workspace),
    staleTime: 60_000,
  });

  const numbers = data?.numbers ?? [];
  const templates = data?.templates ?? [];
  const logicalTemplates = useMemo(() => groupLogicalTemplates(templates), [templates]);

  // ----- State -----
  const [type, setType] = useState<CampaignType>("marketing");
  const preset = TYPE_PRESETS[type];

  const [logicalKey, setLogicalKey] = useState<string>("");
  const [poolCountry, setPoolCountry] = useState<string>("");
  const [numberIds, setNumberIds] = useState<string[]>([]);
  const [csv, setCsv] = useState("phone,name\n");
  const [audienceSource, setAudienceSource] = useState<"paste" | "upload" | "chats" | "saved">("paste");

  const [audience, setAudience] = useState("");
  const [ctaPreset, setCtaPreset] = useState<string>("Call");
  const [ctaCustom, setCtaCustom] = useState("");
  const cta = ctaPreset === "Other" ? ctaCustom : ctaPreset;
  const [campaignName, setCampaignName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);

  const [delayMin, setDelayMin] = useState(preset.delayMin);
  const [delayMax, setDelayMax] = useState(preset.delayMax);
  const [perNumberQuota, setPerNumberQuota] = useState(preset.perNumber);
  const [routing, setRouting] = useState(preset.routing);
  const [mapping, setMapping] = useState<Record<string, string>>({});


  // When type changes, reset defaults (unless user dirty-edited)
  const typeAppliedRef = useRef<CampaignType>("marketing");
  useEffect(() => {
    if (typeAppliedRef.current === type) return;
    typeAppliedRef.current = type;
    setDelayMin(preset.delayMin);
    setDelayMax(preset.delayMax);
    setPerNumberQuota(preset.perNumber);
    setRouting(preset.routing);
    // For Marketing default to single number
    if (!preset.routing && numberIds.length > 1) setNumberIds(numberIds.slice(0, 1));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter logical templates by type category
  const visibleLogical = useMemo(
    () => logicalTemplates.filter((t) => t.category === preset.templateCategory),
    [logicalTemplates, preset.templateCategory],
  );

  const activeLogical: LogicalTemplate | undefined = visibleLogical.find((t) => t.key === logicalKey);

  // Auto-pick first logical when none selected or current invalid for type
  useEffect(() => {
    if (!activeLogical && visibleLogical.length > 0) setLogicalKey(visibleLogical[0].key);
    if (logicalKey && !visibleLogical.find((t) => t.key === logicalKey)) {
      setLogicalKey(visibleLogical[0]?.key ?? "");
    }
  }, [visibleLogical, logicalKey, activeLogical]);

  // Load saved mapping for workspace+logical
  useEffect(() => {
    if (!workspace || !logicalKey) return;
    const saved = loadMapping(workspace.id, logicalKey);
    setMapping(saved);
  }, [workspace, logicalKey]);

  // ----- Audience parsing & mapping -----
  const recipients = useMemo(() => parseCsv(csv), [csv]);
  const columns = useMemo(() => detectColumns(recipients), [recipients]);
  const variableNames = activeLogical?.variables ?? [];

  // Auto-map variables by name match
  useEffect(() => {
    if (!variableNames.length) return;
    setMapping((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const v of variableNames) {
        if (next[v]) continue;
        const lower = v.toLowerCase();
        const match = columns.find((c) => c.toLowerCase() === lower);
        if (match) { next[v] = match; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [variableNames, columns]);

  const mappedRecipients = useMemo(
    () => applyMapping(recipients, mapping, variableNames),
    [recipients, mapping, variableNames],
  );

  // ----- Sender pools (numbers grouped by country) -----
  const pools = useMemo(() => groupNumbersByCountry(numbers), [numbers]);

  // Default pool to the largest available
  useEffect(() => {
    if (!poolCountry && pools.length > 0) setPoolCountry(pools[0].country);
    if (poolCountry && !pools.find((p) => p.country === poolCountry)) {
      setPoolCountry(pools[0]?.country ?? "");
    }
  }, [pools, poolCountry]);

  const activePool = pools.find((p) => p.country === poolCountry);
  const poolNumbers = activePool?.numbers ?? [];

  // "Ready" = number has an approved variant for the chosen logical template (if any)
  const readyInPool = useMemo(() => {
    if (!activeLogical) return poolNumbers;
    return poolNumbers.filter((n) => activeLogical.variantByNumber.has(n.id));
  }, [poolNumbers, activeLogical]);

  // Auto-fill numberIds based on mode + pool
  useEffect(() => {
    if (poolNumbers.length === 0) return;
    if (type === "utility") {
      // Utility: use ALL ready numbers in pool
      const ids = readyInPool.map((n) => n.id);
      setNumberIds(ids.length ? ids : [poolNumbers[0].id]);
    } else {
      // Marketing: single sender — keep current if still in pool & ready, else first ready/first
      setNumberIds((prev) => {
        const stillValid = prev.find((id) => poolNumbers.some((n) => n.id === id));
        if (stillValid) return [stillValid];
        const firstReady = readyInPool[0] ?? poolNumbers[0];
        return [firstReady.id];
      });
    }
  }, [type, poolCountry, readyInPool.length, poolNumbers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeNumbers = numbers.filter((n) => numberIds.includes(n.id));

  // ----- Logical template resolution per number -----
  const resolution = useMemo(() => {
    if (!activeLogical) return { ok: [] as Array<{ numberId: string; template: Template }>, missing: [] as string[] };
    const ok: Array<{ numberId: string; template: Template }> = [];
    const missing: string[] = [];
    for (const n of activeNumbers) {
      const variant = activeLogical.variantByNumber.get(n.id);
      if (variant) ok.push({ numberId: n.id, template: variant });
      else missing.push(n.id);
    }
    return { ok, missing };
  }, [activeLogical, activeNumbers]);

  // ----- Auto name (date | country | audience | template | cta) -----
  useEffect(() => {
    if (nameDirty) return;
    setCampaignName(buildCampaignName({
      geo: poolCountry || "--",
      audience,
      templateLabel: activeLogical?.label,
      cta,
    }));
  }, [poolCountry, audience, activeLogical, cta, nameDirty]);

  // ----- Lazy chats -----
  const chatsQuery = useQuery({
    queryKey: launchKeys.chats(workspace?.id),
    queryFn: () => fetchConversationsLite(workspace?.id, 500),
    enabled: Boolean(workspace) && audienceSource === "chats",
    staleTime: 30_000,
  });

  const useCurrentChats = () => {
    const list = chatsQuery.data ?? [];
    setCsv(["phone,name,conversation_id", ...list.map((c) => `${c.contact_phone},${c.contact_name ?? ""},${c.id}`)].join("\n"));
  };

  // ----- Saved audiences -----
  const [savedList, setSavedList] = useState<SavedAudience[]>([]);
  useEffect(() => { if (workspace) setSavedList(listSavedAudiences(workspace.id)); }, [workspace]);
  const [saveAudName, setSaveAudName] = useState("");

  // ----- Toggles -----
  const toggleNumber = (id: string) => {
    setNumberIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (!routing) return [id]; // single-number mode
      return [...prev, id];
    });
  };

  // ----- ETA -----
  const eta = useMemo(() => {
    const perNumber = activeNumbers.length > 0 ? Math.ceil(recipients.length / activeNumbers.length) : recipients.length;
    const avgDelay = type === "marketing" ? Math.max(1, (delayMin + delayMax) / 2) : (delayMin + delayMax) / 2;
    const seconds = Math.round(perNumber * avgDelay);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  }, [recipients.length, activeNumbers.length, delayMin, delayMax, type]);

  // ----- Preview samples -----
  const previewSamples = useMemo(() => {
    if (!activeLogical) return [];
    return mappedRecipients.slice(0, 3).map((r) => ({
      phone: r.phone,
      body: renderTemplateBody(activeLogical.body, variableNames, r.variables),
    }));
  }, [mappedRecipients, activeLogical, variableNames]);

  // ----- Launch -----
  const launch = useMutation({
    mutationFn: async () => {
      if (!campaignName.trim()) throw new Error("Name the campaign");
      if (!activeLogical) throw new Error("Pick a logical template");
      if (numberIds.length === 0) throw new Error("Select at least one sending number");
      if (recipients.length === 0) throw new Error("Add recipients");
      if (resolution.missing.length > 0) throw new Error("Some numbers don't have an approved variant of this template");

      // Distribute recipients across numbers
      const buckets = new Map<string, Recipient[]>();
      const targets = resolution.ok;
      if (targets.length === 1) {
        buckets.set(targets[0].numberId, mappedRecipients);
      } else {
        targets.forEach((t) => buckets.set(t.numberId, []));
        mappedRecipients.forEach((r, i) => {
          const t = targets[i % targets.length];
          buckets.get(t.numberId)!.push(r);
        });
      }

      const results: Array<{ ok: boolean; numberId: string; res?: any; error?: string }> = [];
      for (const t of targets) {
        const list = buckets.get(t.numberId) ?? [];
        if (list.length === 0) continue;
        const subname = targets.length > 1
          ? `${campaignName} :: ${(numbers.find((n) => n.id === t.numberId)?.label ?? `+${numbers.find((n) => n.id === t.numberId)?.phone_number}`)}`
          : campaignName;
        const { data: res, error } = await supabase.functions.invoke("campaigns", {
          body: {
            action: "launch",
            name: subname,
            whatsapp_number_id: t.numberId,
            template_id: t.template.id,
            delay_min_seconds: delayMin,
            delay_max_seconds: delayMax,
            recipients: list,
          },
        });
        if (error) results.push({ ok: false, numberId: t.numberId, error: error.message });
        else if ((res as any)?.error) results.push({ ok: false, numberId: t.numberId, error: (res as any).error });
        else results.push({ ok: true, numberId: t.numberId, res });
      }
      // Persist mapping for next time
      if (workspace && activeLogical) saveMapping(workspace.id, activeLogical.key, mapping);
      return results;
    },
    onSuccess: async (results) => {
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      if (failed === 0) toast.success(`Launched ${ok} campaign${ok === 1 ? "" : "s"}`);
      else toast.error(`Launched ${ok}, failed ${failed}: ${results.find((r) => !r.ok)?.error ?? ""}`);
      qc.invalidateQueries({ queryKey: ["crm", "campaigns"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Launch failed"),
  });

  const sync = useMutation({
    mutationFn: async () => {
      if (numbers.length === 0) throw new Error("Add a number first");
      const targetNumberId = numberIds[0] || numbers[0].id;
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "sync_templates", whatsapp_number_id: targetNumberId },
      });
      if (error) throw error;
      return res as { fetched: number; upserted: number };
    },
    onSuccess: async (r) => {
      toast.success(`Synced ${r.upserted}/${r.fetched}`);
      await qc.invalidateQueries({ queryKey: launchKeys.essentials(workspace?.id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 grid lg:grid-cols-[1fr_320px] gap-4 max-w-[1400px] mx-auto pb-32">
        {/* MAIN COLUMN */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl">Launch campaign</h2>
            </div>
            {workspace && (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/ws/${workspace.slug}/campaigns`}><ArrowLeft className="w-4 h-4 mr-1" />Back to campaigns</Link>
              </Button>
            )}
          </div>

          {/* Step 1: Campaign type */}
          <Step n={1} icon={Zap} title="Campaign type">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(TYPE_PRESETS) as CampaignType[]).map((k) => {
                const p = TYPE_PRESETS[k];
                const active = type === k;
                return (
                  <button
                    key={k}
                    onClick={() => setType(k)}
                    className={`text-left rounded-md border p-3 transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {k === "marketing" ? <Zap className="w-4 h-4 text-primary" /> : <Timer className="w-4 h-4 text-amber-500" />}
                      {p.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {k === "marketing"
                        ? "0/0 delay, single number, send as fast as possible."
                        : "Randomized 60-120s delay per number, distribute across numbers."}
                    </div>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* Step 2: Logical template */}
          <Step n={2} icon={FileText} title="Template" right={
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />Sync Gupshup
            </Button>
          }>
            {visibleLogical.length === 0 ? (
              <div className="text-sm text-muted-foreground rounded-md border border-dashed border-border p-3">
                No approved {preset.templateCategory} templates. Sync from Gupshup or create one.
              </div>
            ) : (
              <>
                <Select value={logicalKey} onValueChange={setLogicalKey}>
                  <SelectTrigger><SelectValue placeholder="Pick a logical template" /></SelectTrigger>
                  <SelectContent>
                    {visibleLogical.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        <span className="inline-flex items-center gap-2">
                          <span>{t.label}</span>
                          <span className="text-xs text-muted-foreground">({t.variants.length} variant{t.variants.length === 1 ? "" : "s"})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeLogical && (
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    <div>Variants: {activeLogical.variants.map((v) => v.name).join(", ")}</div>
                    {activeLogical.variables.length > 0 && (
                      <div>Variables: {activeLogical.variables.map((v) => `{${v}}`).join(" ")}</div>
                    )}
                  </div>
                )}
              </>
            )}
          </Step>

          {/* Step 3: Sender pool */}
          <Step n={3} icon={Phone} title="Sender pool">
            {pools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active numbers in this workspace.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Country pool</span>
                  <Select value={poolCountry} onValueChange={setPoolCountry}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pools.map((p) => (
                        <SelectItem key={p.country} value={p.country}>
                          {p.country} · {p.numbers.length} number{p.numbers.length === 1 ? "" : "s"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-[11px]">
                    {readyInPool.length} ready of {poolNumbers.length}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] border-primary/30 text-primary">
                    {type === "utility" ? "Utility · distribute across pool" : "Marketing · single sender"}
                  </Badge>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 mt-3">
                  {poolNumbers.map((n) => {
                    const selected = numberIds.includes(n.id);
                    const hasVariant = activeLogical?.variantByNumber.has(n.id);
                    const inputType = type === "utility" ? "checkbox" : "radio";
                    return (
                      <label
                        key={n.id}
                        className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer text-sm ${selected ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        <input
                          type={inputType}
                          name="number-pick"
                          checked={selected}
                          onChange={() => toggleNumber(n.id)}
                        />
                        <span className="truncate flex-1">{n.label ?? `+${n.phone_number}`}</span>
                        {activeLogical && (
                          hasVariant
                            ? <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">ready</Badge>
                            : <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">no variant</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {resolution.missing.length > 0 && (
              <div className="mt-2 text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {resolution.missing.length} selected number(s) lack an approved variant of this template. Launch is blocked until resolved.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-3">
              <Field label="Quota / number"><Input type="number" min={1} value={perNumberQuota} onChange={(e) => setPerNumberQuota(Number(e.target.value))} /></Field>
              <Field label={`Min delay (s)${type === "utility" ? " · ≥60" : ""}`}>
                <Input type="number" min={type === "utility" ? UTILITY_MIN_DELAY : 0} value={delayMin}
                  onChange={(e) => setDelayMin(Math.max(type === "utility" ? UTILITY_MIN_DELAY : 0, Number(e.target.value)))} />
              </Field>
              <Field label="Max delay (s)">
                <Input type="number" min={delayMin} value={delayMax}
                  onChange={(e) => setDelayMax(Math.max(delayMin, Number(e.target.value)))} />
              </Field>
            </div>
          </Step>

          {/* Step 4: Audience */}
          <Step n={4} icon={Users} title="Audience">
            <Tabs value={audienceSource} onValueChange={(v) => setAudienceSource(v as any)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="paste"><FileText className="w-3.5 h-3.5 mr-1" />Paste</TabsTrigger>
                <TabsTrigger value="upload"><Upload className="w-3.5 h-3.5 mr-1" />Upload</TabsTrigger>
                <TabsTrigger value="chats"><MessagesSquare className="w-3.5 h-3.5 mr-1" />Chats</TabsTrigger>
                <TabsTrigger value="saved"><Bookmark className="w-3.5 h-3.5 mr-1" />Saved</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-3">
                <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="phone,name&#10;971500000000,Arseny" />
              </TabsContent>

              <TabsContent value="upload" className="mt-3">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="block text-sm w-full"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setCsv(text);
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">CSV with header row: phone, name, then any custom variable columns.</p>
              </TabsContent>

              <TabsContent value="chats" className="mt-3 space-y-2">
                {chatsQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading current chats...</div>
                ) : (
                  <Button variant="outline" size="sm" onClick={useCurrentChats}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />Use current chats ({chatsQuery.data?.length ?? 0})
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="saved" className="mt-3 space-y-2">
                {savedList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No saved audiences yet. Save one from the current parsed list below.</p>
                ) : (
                  <div className="space-y-1">
                    {savedList.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <Bookmark className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.name}</span>
                        <span className="text-xs text-muted-foreground">{a.count}</span>
                        <Button variant="ghost" size="sm" onClick={() => setCsv(a.csv)}>Load</Button>
                        <Button variant="ghost" size="icon" onClick={() => { deleteSavedAudience(workspace!.id, a.id); setSavedList(listSavedAudiences(workspace!.id)); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between flex-wrap gap-2 mt-3 text-xs text-muted-foreground">
              <span>{recipients.length} valid recipients · {columns.length} columns detected</span>
              {recipients.length > 0 && workspace && (
                <div className="flex items-center gap-1">
                  <Input className="h-7 w-44 text-xs" placeholder="Audience name" value={saveAudName} onChange={(e) => setSaveAudName(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={() => {
                    saveAudience(workspace.id, saveAudName || `Audience ${savedList.length + 1}`, csv, recipients.length);
                    setSavedList(listSavedAudiences(workspace.id));
                    setSaveAudName("");
                    toast.success("Audience saved");
                  }}>
                    <Save className="w-3.5 h-3.5 mr-1" />Save
                  </Button>
                </div>
              )}
            </div>
          </Step>

          {/* Step 5: Variable mapping */}
          {variableNames.length > 0 && (
            <Step n={5} icon={FileText} title="Variable mapping">
              <div className="space-y-2">
                {variableNames.map((v) => {
                  const current = mapping[v] ?? "";
                  const isStatic = current.startsWith("__static:");
                  return (
                    <div key={v} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{`{${v}}`}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Select value={isStatic ? "__static__" : current || "__none__"} onValueChange={(val) => {
                        setMapping((prev) => {
                          const next = { ...prev };
                          if (val === "__none__") delete next[v];
                          else if (val === "__static__") next[v] = "__static:";
                          else next[v] = val;
                          return next;
                        });
                      }}>
                        <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Pick column" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— unset —</SelectItem>
                          {columns.map((c) => <SelectItem key={c} value={c}>column: {c}</SelectItem>)}
                          <SelectItem value="__static__">static value...</SelectItem>
                        </SelectContent>
                      </Select>
                      {isStatic && (
                        <Input
                          className="h-8 flex-1"
                          placeholder="Static value"
                          value={current.slice("__static:".length)}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [v]: `__static:${e.target.value}` }))}
                        />
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">Mapping is auto-saved per template for this workspace.</p>
              </div>
            </Step>
          )}

          {/* Step 6: Naming */}
          <Step n={6} icon={Bookmark} title="Campaign name">
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="Audience">
                <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="GTM Professionals" />
              </Field>
              <Field label="CTA">
                <div className="flex gap-2">
                  <Select value={ctaPreset} onValueChange={setCtaPreset}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTA_PRESETS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {ctaPreset === "Other" && (
                    <Input className="flex-1" value={ctaCustom} onChange={(e) => setCtaCustom(e.target.value)} placeholder="Custom CTA" />
                  )}
                </div>
              </Field>
            </div>
            <div className="mt-2">
              <Field label="Generated name (editable)">
                <Input value={campaignName} onChange={(e) => { setCampaignName(e.target.value); setNameDirty(true); }} />
              </Field>
              {nameDirty && (
                <button className="text-xs text-primary underline mt-1" onClick={() => setNameDirty(false)}>
                  Reset to auto-generated
                </button>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Format: YYYY-MM-DD | COUNTRY | AUDIENCE | TEMPLATE | CTA
              </p>
            </div>
          </Step>

          {/* Step 7: Preview */}
          <Step n={7} icon={Eye} title="Rendered preview">
            {!activeLogical?.body ? (
              <p className="text-sm text-muted-foreground">No template body to preview.</p>
            ) : previewSamples.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add recipients to preview the rendered message.</p>
            ) : (
              <div className="space-y-2">
                {previewSamples.map((s, i) => (
                  <div key={i} className="rounded-md border border-border bg-card/30 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xs text-muted-foreground">To +{s.phone}</div>
                      {s.missing.length > 0 && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                          <AlertTriangle className="w-3 h-3 mr-1" />Missing: {s.missing.join(", ")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{s.body}</div>
                  </div>
                ))}
              </div>
            )}
          </Step>

          {/* Step 7: Preview */}
          <Step n={7} icon={Eye} title="Rendered preview">
            {!activeLogical?.body ? (
              <p className="text-sm text-muted-foreground">No template body to preview.</p>
            ) : previewSamples.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add recipients to preview the rendered message.</p>
            ) : (
              <div className="space-y-2">
                {previewSamples.map((s, i) => (
                  <div key={i} className="rounded-md border border-border bg-card/30 p-3">
                    <div className="text-xs text-muted-foreground mb-1.5">To +{s.phone}</div>
                    <div className="text-sm whitespace-pre-wrap">{s.body}</div>
                  </div>
                ))}
              </div>
            )}
          </Step>
        </div>

        {/* SIDEBAR */}
        <aside className="rounded-lg border border-border bg-card/40 p-4 space-y-3 lg:sticky lg:top-4 self-start">
          <div className="font-display text-lg flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Review</div>
          <Row label="Type" value={preset.label} />
          <Row label="Workspace" value={workspace?.name ?? "-"} />
          <Row label="Template" value={activeLogical?.label ?? "-"} />
          <Row label="Numbers" value={activeNumbers.length || "Pick at least 1"} />
          <Row label="Recipients" value={recipients.length} />
          <Row label="Per number" value={activeNumbers.length ? Math.ceil(recipients.length / activeNumbers.length) : "-"} />
          <Row label="Speed" value={delayMin === 0 && delayMax === 0 ? "Blast" : `${delayMin}-${delayMax}s`} />
          <Row label="ETA" value={eta} />
          {resolution.missing.length > 0 && (
            <div className="text-xs text-amber-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {resolution.missing.length} number(s) missing template variant.
            </div>
          )}
          <Button
            className="w-full"
            onClick={() => launch.mutate()}
            disabled={launch.isPending || resolution.missing.length > 0 || recipients.length === 0 || !activeLogical || activeNumbers.length === 0}
          >
            <Play className="w-4 h-4 mr-1" />{launch.isPending ? "Launching..." : "Launch now"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {resolution.ok.length > 1 ? `Will create ${resolution.ok.length} sub-campaigns, one per number.` : "Single campaign."}
          </p>
        </aside>
      </div>
    </div>
  );
}

const Step = ({ n, icon: Icon, title, right, children }: { n: number; icon: any; title: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">{n}</span>
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h3 className="font-medium flex-1">{title}</h3>
      {right}
    </div>
    {children}
  </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><label className="text-xs text-muted-foreground">{label}</label>{children}</div>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium truncate ml-2">{value}</span></div>
);

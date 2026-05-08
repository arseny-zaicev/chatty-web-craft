import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Megaphone, Play, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { crmKeys, fetchCampaignBase, fetchConversationsForCsv } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Recipient = { phone: string; name?: string; variables?: Record<string, string>; conversation_id?: string };

const parseRecipients = (raw: string): Recipient[] => {
  const rows = raw.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (rows.length === 0) return [];
  const first = rows[0].split(",").map((c) => c.trim().toLowerCase());
  const hasHeader = first.some((c) => ["phone", "contact_phone", "name", "contact_name"].includes(c));
  const headers = hasHeader ? first : ["phone", "name"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((row) => {
    const cols = row.split(",").map((c) => c.trim());
    const item: Recipient = { phone: "", variables: {} };
    headers.forEach((h, idx) => {
      const value = cols[idx] ?? "";
      if (h === "phone" || h === "contact_phone") item.phone = value;
      else if (h === "name" || h === "contact_name") item.name = value;
      else if (value) item.variables![h] = value;
    });
    return item;
  }).filter((r) => r.phone.replace(/[^\d]/g, "").length >= 8);
};

const MOCK_TEMPLATE_NAMES = new Set(["test_template"]);

type SyncInfo = { at: number; fetched: number; upserted: number; warning?: string } | null;

const Campaigns = ({ workspaceId, embedded = false }: { workspaceId?: string; embedded?: boolean } = {}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: crmKeys.campaigns(workspaceId), queryFn: () => fetchCampaignBase(workspaceId) });
  const numbers = data?.numbers ?? [];
  const templates = data?.templates ?? [];
  const campaigns = data?.campaigns ?? [];
  const conversations = data?.conversations ?? [];

  const [numberId, setNumberId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [campaignName, setCampaignName] = useState("Test outreach");
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [variables, setVariables] = useState("name");
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [csv, setCsv] = useState("phone,name\n971500000000,Arseny");
  const [syncInfo, setSyncInfo] = useState<SyncInfo>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSendResults, setLastSendResults] = useState<Array<{ phone?: string; status?: string; error?: string }>>([]);

  const recipients = useMemo(() => parseRecipients(csv), [csv]);
  const selectedNumber = numberId || numbers[0]?.id || "";
  const selectedTemplate = templateId || templates[0]?.id || "";
  const numberObj = numbers.find((n: any) => n.id === selectedNumber) as any;
  const templateObj = templates.find((t: any) => t.id === selectedTemplate) as any;

  // ---------- readiness ----------
  const numberStatus = useMemo(() => {
    if (!numberObj) return { label: "not ready", tone: "warn" as const, reason: "No sending number selected" };
    if (numberObj.is_active === false) return { label: "blocked", tone: "bad" as const, reason: "Number is disabled" };
    const key: string | null = numberObj.provider_api_key ?? null;
    if (!key) return { label: "global key", tone: "ok" as const, reason: "Using global GUPSHUP_API_KEY fallback" };
    if (key.startsWith("sk_")) return { label: "missing app key", tone: "warn" as const, reason: "Per-number key is a Partner token (sk_...) - falling back to global key" };
    return { label: "active", tone: "ok" as const, reason: "App-level key configured" };
  }, [numberObj]);

  const templateStatus = useMemo(() => {
    if (!templateObj) return { label: "none", tone: "warn" as const, reason: "No template selected" };
    const status = (templateObj.status || "pending").toLowerCase();
    const isMock = MOCK_TEMPLATE_NAMES.has(templateObj.name) || !templateObj.provider_template_id;
    if (status === "approved" && isMock) return { label: "mock/local", tone: "warn" as const, reason: "Local fallback template, not synced from Gupshup" };
    if (status === "approved") return { label: "approved", tone: "ok" as const, reason: "Approved by Gupshup" };
    if (status === "rejected") return { label: "rejected", tone: "bad" as const, reason: "Template rejected by Gupshup" };
    if (status === "paused") return { label: "paused", tone: "bad" as const, reason: "Template paused" };
    return { label: status, tone: "warn" as const, reason: `Template status: ${status}` };
  }, [templateObj]);

  const blockingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!selectedNumber) reasons.push("Sending number is missing");
    else if (numberObj?.is_active === false) reasons.push("Sending number is blocked");
    if (!selectedTemplate) reasons.push("Template is missing");
    else {
      const status = (templateObj?.status || "").toLowerCase();
      if (status && status !== "approved") reasons.push(`Template is not approved (${status})`);
      if (templateObj && (MOCK_TEMPLATE_NAMES.has(templateObj.name) || !templateObj.provider_template_id)) {
        reasons.push("Selected template is only a local mock - sending will likely fail");
      }
    }
    if (recipients.length === 0) reasons.push("No valid recipients parsed from CSV");
    if (delayMax < delayMin) reasons.push("Max delay is less than min delay");
    return reasons;
  }, [selectedNumber, selectedTemplate, numberObj, templateObj, recipients.length, delayMin, delayMax]);

  // Hard blockers (disable Launch). Mock template & key warnings are soft - allow attempt.
  const hardBlocked = !selectedNumber || numberObj?.is_active === false || !selectedTemplate || recipients.length === 0 || delayMax < delayMin;
  const isReady = blockingReasons.length === 0;

  const mutation = useMutation({
    mutationFn: async () => {
      setLastError(null);
      setLastSendResults([]);
      if (!selectedNumber) throw new Error("Add a WhatsApp number first");
      let activeTemplate = selectedTemplate;
      if (!activeTemplate) {
        if (!templateName.trim()) throw new Error("Add approved Gupshup template name");
        const { data: created, error } = await supabase.functions.invoke("campaigns", {
          body: {
            action: "upsert_template",
            whatsapp_number_id: selectedNumber,
            name: templateName.trim(),
            body: templateBody.trim(),
            variables: variables.split(",").map((v) => v.trim()).filter(Boolean),
          },
        });
        if (error) throw error;
        if ((created as { error?: string })?.error) throw new Error((created as { error: string }).error);
        activeTemplate = (created as { template_id: string }).template_id;
      }
      if (recipients.length === 0) throw new Error("Paste CSV recipients first");
      const { data: launched, error } = await supabase.functions.invoke("campaigns", {
        body: {
          action: "launch",
          name: campaignName.trim() || "Campaign",
          whatsapp_number_id: selectedNumber,
          template_id: activeTemplate,
          delay_min_seconds: delayMin,
          delay_max_seconds: delayMax,
          recipients,
        },
      });
      if (error) throw error;
      if ((launched as { error?: string })?.error) throw new Error((launched as { error: string }).error);
      return launched as { immediate?: Array<{ phone?: string; status?: string; error?: string }> };
    },
    onSuccess: async (res) => {
      const immediate = res?.immediate ?? [];
      setLastSendResults(immediate);
      const failed = immediate.filter((r) => r.status === "failed");
      if (failed.length > 0) {
        setLastError(failed[0].error ?? "Some recipients failed");
        toast.error(`Sent with ${failed.length} failure(s)`);
      } else {
        toast.success(immediate.length > 0 ? `Sent ${immediate.length} immediately` : "Campaign scheduled");
      }
      await queryClient.invalidateQueries({ queryKey: crmKeys.campaigns(workspaceId) });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Launch failed";
      setLastError(msg);
      toast.error(msg);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNumber) throw new Error("Pick a sending number first");
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "sync_templates", whatsapp_number_id: selectedNumber },
      });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      return res as { fetched: number; upserted: number; warning?: string };
    },
    onSuccess: async (res) => {
      setSyncInfo({ at: Date.now(), fetched: res.fetched, upserted: res.upserted, warning: res.warning });
      if (res.warning) toast.warning(`Synced with warning: ${res.warning}`);
      else toast.success(`Synced ${res.upserted}/${res.fetched} templates`);
      await queryClient.invalidateQueries({ queryKey: crmKeys.campaigns(workspaceId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Sync failed"),
  });
  const loadChats = async () => {
    try {
      const list = conversations.length > 0 ? conversations : await fetchConversationsForCsv(workspaceId);
      setCsv(["phone,name,conversation_id", ...list.map((c: any) => `${c.contact_phone},${c.contact_name ?? ""},${c.id}`)].join("\n"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load chats");
    }
  };

  const toneClass = (tone: "ok" | "warn" | "bad") =>
    tone === "ok" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : tone === "warn" ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
    : "bg-red-500/15 text-red-600 border-red-500/30";

  return (
    <>
      <Helmet><title>Campaigns - Iskra CRM</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className={`${embedded ? "min-h-full" : "min-h-screen"} bg-background text-foreground`}>
        {!embedded && <header className="h-14 px-6 border-b border-border flex items-center justify-between bg-card/40">
          <div className="flex items-center gap-3"><Megaphone className="w-5 h-5 text-primary" /><h1 className="font-display text-lg">Campaigns</h1></div>
          <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => navigate("/pipeline")}><ArrowLeft className="w-4 h-4 mr-1" />Pipeline</Button><Button variant="ghost" size="sm" onClick={() => navigate("/crm")}>CRM</Button></div>
        </header>}
        {isLoading ? <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
          <main className="p-4 grid lg:grid-cols-[1fr_360px] gap-4">
            <section className="rounded-lg border border-border bg-card/30 p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Campaign name"><Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} /></Field>
                <Field label="Sending number">
                  <Select value={selectedNumber} onValueChange={setNumberId}>
                    <SelectTrigger><SelectValue placeholder="Select number" /></SelectTrigger>
                    <SelectContent>{numbers.map((n) => <SelectItem key={n.id} value={n.id}>{n.display_name ?? `+${n.phone_number}`}</SelectItem>)}</SelectContent>
                  </Select>
                  {numberObj && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className={`text-[10px] ${toneClass(numberStatus.tone)}`}>number: {numberStatus.label}</Badge>
                      <span className="text-[11px] text-muted-foreground truncate">{numberStatus.reason}</span>
                    </div>
                  )}
                </Field>
              </div>
              <div className="grid sm:grid-cols-[1fr_auto_auto_1fr] gap-2 items-end">
                <Field label="Approved template">
                  <Select value={selectedTemplate} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Select or create below" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t: any) => {
                        const status = t.status || "pending";
                        const dot = status === "approved" ? "bg-emerald-500" : status === "rejected" ? "bg-red-500" : status === "paused" ? "bg-amber-500" : "bg-yellow-400 animate-pulse";
                        return (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="inline-flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                              <span>{t.name} · {t.language}</span>
                              <span className="text-xs text-muted-foreground">({status}{t.category ? ` · ${t.category}` : ""})</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {templateObj && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className={`text-[10px] ${toneClass(templateStatus.tone)}`}>template: {templateStatus.label}</Badge>
                      <span className="text-[11px] text-muted-foreground truncate">{templateStatus.reason}</span>
                    </div>
                  )}
                </Field>
                <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh list"><RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
                <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || !selectedNumber} title="Pull templates and statuses from Gupshup">{syncMutation.isPending ? "Syncing..." : "Sync Gupshup"}</Button>
                <Field label="New template name"><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="gupshup_approved_name" /></Field>
              </div>
              {syncInfo && (
                <div className={`rounded-md border p-2 text-xs ${syncInfo.warning ? "border-amber-500/30 bg-amber-500/10 text-amber-700" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"}`}>
                  Last sync {new Date(syncInfo.at).toLocaleTimeString()} · {syncInfo.upserted}/{syncInfo.fetched} templates {syncInfo.warning ? `· fallback in use: ${syncInfo.warning}` : "· OK"}
                </div>
              )}
              <Field label="Template body preview"><Textarea rows={3} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} placeholder="Only for manager preview - sending uses approved Gupshup template name" /></Field>
              <Field label="Variables"><Input value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="name, city, offer" /></Field>
              <div className="grid sm:grid-cols-2 gap-3"><Field label="Min delay seconds"><Input type="number" min={0} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} /></Field><Field label="Max delay seconds"><Input type="number" min={delayMin} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} /></Field></div>
              <Field label={`Recipients CSV - ${recipients.length} valid`}><Textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={loadChats}><RefreshCw className="w-4 h-4 mr-1" />Use current chats</Button>
                <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || hardBlocked} title={hardBlocked ? blockingReasons.join(" · ") : "Launch campaign"}>
                  <Play className="w-4 h-4 mr-1" />{mutation.isPending ? "Scheduling..." : "Launch with delays"}
                </Button>
              </div>
              {lastError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-600 p-2 text-xs flex gap-2 items-start">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <div><div className="font-medium">Provider/send error</div><div className="opacity-90 break-words">{lastError}</div></div>
                </div>
              )}
              {lastSendResults.length > 0 && (
                <div className="rounded-md border border-border bg-background/40 p-2 text-xs space-y-1 max-h-40 overflow-auto">
                  <div className="font-medium mb-1">Last send results</div>
                  {lastSendResults.map((r, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span className="truncate">{r.phone}</span>
                      <span className={r.status === "failed" ? "text-red-600" : "text-emerald-600"}>{r.status}{r.error ? ` · ${r.error}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <aside className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
              <div className={`rounded-md border p-3 ${isReady ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                <div className="flex items-center gap-2 font-medium text-sm">
                  {isReady ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  {isReady ? "Ready to launch" : "Blocked"}
                </div>
                {!isReady && (
                  <ul className="mt-2 text-xs space-y-1 list-disc list-inside text-muted-foreground">
                    {blockingReasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
                {isReady && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {recipients.length} recipients · delay {delayMin}-{delayMax}s
                  </div>
                )}
              </div>
              <div className="font-medium flex items-center gap-2"><Plus className="w-4 h-4 text-primary" />Recent campaigns</div>
              {campaigns.length === 0 ? <div className="text-sm text-muted-foreground">No campaigns yet.</div> : campaigns.map((c) => <div key={c.id} className="rounded-md border border-border p-3 text-sm"><div className="font-medium truncate">{c.name}</div><div className="text-xs text-muted-foreground mt-1">{c.status} · {c.sent_count}/{c.total_recipients} sent · {c.failed_count} failed</div><div className="text-xs text-muted-foreground">Delay {c.delay_min_seconds}-{c.delay_max_seconds}s</div></div>)}
            </aside>
          </main>
        )}
      </div>
    </>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;

export default Campaigns;

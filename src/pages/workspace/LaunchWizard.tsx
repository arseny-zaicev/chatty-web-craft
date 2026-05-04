import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, RefreshCw, Rocket, Users, FileText, Phone, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { crmKeys, fetchCampaignBase } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { WorkspaceContext } from "./WorkspaceLayout";

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

export default function LaunchWizard() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: crmKeys.campaigns, queryFn: fetchCampaignBase });

  const numbers = (data?.numbers ?? []).filter((n: any) => !workspace || n.workspace_id === workspace.id || !n.workspace_id);
  const templates = (data?.templates ?? []).filter((t: any) => !workspace || t.workspace_id === workspace.id || !t.workspace_id);
  const conversations = data?.conversations ?? [];

  const [campaignName, setCampaignName] = useState("");
  const [csv, setCsv] = useState("phone,name\n");
  const [templateId, setTemplateId] = useState("");
  const [numberIds, setNumberIds] = useState<string[]>([]);
  const [perNumberQuota, setPerNumberQuota] = useState(200);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);

  const recipients = useMemo(() => parseRecipients(csv), [csv]);
  const activeTemplate = templates.find((t: any) => t.id === templateId);
  const activeNumbers = numbers.filter((n) => numberIds.includes(n.id));
  const isUtility = (activeTemplate as any)?.category === "utility";

  const eta = useMemo(() => {
    const perNumber = activeNumbers.length > 0 ? Math.ceil(recipients.length / activeNumbers.length) : recipients.length;
    const avgDelay = isUtility ? 90 : (delayMin + delayMax) / 2;
    const seconds = perNumber * avgDelay;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  }, [recipients.length, activeNumbers.length, delayMin, delayMax, isUtility]);

  const toggleNumber = (id: string) => setNumberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const launch = useMutation({
    mutationFn: async () => {
      if (!campaignName.trim()) throw new Error("Name the campaign");
      if (!templateId) throw new Error("Pick an approved template");
      if (numberIds.length === 0) throw new Error("Select at least one sending number");
      if (recipients.length === 0) throw new Error("Add recipients (CSV)");
      const primary = numberIds[0];
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: {
          action: "launch",
          name: campaignName.trim(),
          whatsapp_number_id: primary,
          template_id: templateId,
          delay_min_seconds: isUtility ? 90 : delayMin,
          delay_max_seconds: isUtility ? 120 : delayMax,
          recipients,
        },
      });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      return res;
    },
    onSuccess: async () => {
      toast.success("Campaign scheduled");
      await qc.invalidateQueries({ queryKey: crmKeys.campaigns });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Launch failed"),
  });

  const sync = useMutation({
    mutationFn: async () => {
      if (numbers.length === 0) throw new Error("Add a number first");
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "sync_templates", whatsapp_number_id: numberIds[0] || numbers[0].id },
      });
      if (error) throw error;
      return res as { fetched: number; upserted: number };
    },
    onSuccess: async (r) => { toast.success(`Synced ${r.upserted}/${r.fetched}`); await qc.invalidateQueries({ queryKey: crmKeys.campaigns }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const loadChats = () => setCsv(["phone,name,conversation_id", ...conversations.map((c) => `${c.contact_phone},${c.contact_name ?? ""},${c.id}`)].join("\n"));

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 grid lg:grid-cols-[1fr_320px] gap-4 max-w-[1400px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Rocket className="w-5 h-5 text-primary" /><h2 className="font-display text-xl">Launch campaign</h2></div>
          {workspace && <Button asChild variant="ghost" size="sm"><Link to={`/ws/${workspace.slug}/campaigns`}><ArrowLeft className="w-4 h-4 mr-1" />Back to campaigns</Link></Button>}
        </div>

        <Step n={1} icon={Rocket} title="Campaign name">
          <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder={`${workspace?.name ?? "Client"} - Spring promo`} />
        </Step>

        <Step n={2} icon={Users} title="Audience">
          <div className="flex flex-wrap gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={loadChats}><RefreshCw className="w-4 h-4 mr-1" />Use current chats ({conversations.length})</Button>
            <span className="text-sm text-muted-foreground self-center">{recipients.length} valid recipients parsed</span>
          </div>
          <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="phone,name&#10;971500000000,Arseny" />
        </Step>

        <Step n={3} icon={FileText} title="Template">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Pick approved template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => {
                    const status = t.status || "pending";
                    const dot = status === "approved" ? "bg-emerald-500" : status === "rejected" ? "bg-red-500" : status === "paused" ? "bg-amber-500" : "bg-yellow-400 animate-pulse";
                    return <SelectItem key={t.id} value={t.id}><span className="inline-flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${dot}`} /><span>{t.name} · {t.language}</span><span className="text-xs text-muted-foreground">({status}{t.category ? ` · ${t.category}` : ""})</span></span></SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh"><RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>{sync.isPending ? "Syncing..." : "Sync Gupshup"}</Button>
          </div>
          {activeTemplate && (
            <p className="text-xs text-muted-foreground mt-2">
              Category: <span className="font-medium">{(activeTemplate as any).category ?? "marketing"}</span>
              {isUtility && " - utility templates send with throttled ~90s delay"}
            </p>
          )}
        </Step>

        <Step n={4} icon={Phone} title="Sending numbers">
          {numbers.length === 0 ? <p className="text-sm text-muted-foreground">No numbers in this workspace yet.</p> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {numbers.map((n) => (
                <label key={n.id} className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer ${numberIds.includes(n.id) ? "border-primary bg-primary/5" : "border-border"}`}>
                  <input type="checkbox" checked={numberIds.includes(n.id)} onChange={() => toggleNumber(n.id)} />
                  <span className="text-sm truncate">{n.display_name ?? `+${n.phone_number}`}</span>
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Field label="Quota / number"><Input type="number" min={1} value={perNumberQuota} onChange={(e) => setPerNumberQuota(Number(e.target.value))} /></Field>
            <Field label={isUtility ? "Min (locked 90)" : "Min delay (s)"}><Input type="number" min={5} value={isUtility ? 90 : delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} disabled={isUtility} /></Field>
            <Field label={isUtility ? "Max (locked 120)" : "Max delay (s)"}><Input type="number" min={delayMin} value={isUtility ? 120 : delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} disabled={isUtility} /></Field>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Auto-distributes recipients across selected numbers, ~{perNumberQuota}/number max.</p>
        </Step>
      </div>

      <aside className="rounded-lg border border-border bg-card/40 p-4 space-y-3 lg:sticky lg:top-4 self-start">
        <div className="font-display text-lg flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Review</div>
        <Row label="Workspace" value={workspace?.name ?? "-"} />
        <Row label="Recipients" value={recipients.length} />
        <Row label="Numbers" value={activeNumbers.length || "Pick at least 1"} />
        <Row label="Per number" value={activeNumbers.length ? Math.ceil(recipients.length / activeNumbers.length) : "-"} />
        <Row label="Template" value={activeTemplate?.name ?? "-"} />
        <Row label="Speed" value={isUtility ? "Throttled (~90s)" : `${delayMin}-${delayMax}s`} />
        <Row label="ETA" value={eta} />
        <Button className="w-full" onClick={() => launch.mutate()} disabled={launch.isPending}><Play className="w-4 h-4 mr-1" />{launch.isPending ? "Launching..." : "Launch now"}</Button>
        <p className="text-[11px] text-muted-foreground">Scheduling and recurrence coming next.</p>
      </aside>
    </div>
  );
}

const Step = ({ n, icon: Icon, title, children }: { n: number; icon: any; title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
    <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">{n}</span><Icon className="w-4 h-4 text-muted-foreground" /><h3 className="font-medium">{title}</h3></div>
    {children}
  </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><label className="text-xs text-muted-foreground">{label}</label>{children}</div>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium truncate ml-2">{value}</span></div>
);

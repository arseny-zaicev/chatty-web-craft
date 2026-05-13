import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Phone, RefreshCw, Save, Loader2, Ban, Copy, Check, ExternalLink, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { geoFromPhone } from "@/lib/launchData";

type NumberStatus = "active" | "ready" | "stock" | "warming" | "restricted" | "banned" | "draft" | "inactive";
type NumberUsage = "marketing" | "utility" | "both";

type NumberRow = {
  id: string;
  workspace_id: string;
  phone_number: string;
  display_name: string | null;
  label: string | null;
  partner_source: string | null;
  bm_name: string | null;
  business_manager_id: string | null;
  notes: string | null;
  provider_app_id: string | null;
  provider_api_key: string | null;
  is_active: boolean;
  connected_in_gupshup: boolean;
  connected_in_iskra: boolean;
  status: NumberStatus;
  usage_type: NumberUsage;
  country_code: string | null;
  webhook_connected: boolean;
};

type BMOption = { id: string; name: string; status: string };

type Workspace = { id: string; name: string };

const fetchData = async (workspaceId: string) => {
  const [{ data: numbers, error: nErr }, { data: tpl, error: tErr }, { data: workspaces, error: wErr }, { data: bms }] = await Promise.all([
    supabase.from("whatsapp_numbers")
      .select("id, workspace_id, phone_number, display_name, label, partner_source, bm_name, business_manager_id, notes, provider_app_id, provider_api_key, is_active, connected_in_gupshup, connected_in_iskra, status, usage_type, country_code, webhook_connected")
      .eq("workspace_id", workspaceId),
    supabase.from("message_templates")
      .select("whatsapp_number_id, status, synced_at")
      .eq("workspace_id", workspaceId),
    supabase.from("workspaces").select("id, name").eq("is_active", true),
    supabase.from("business_managers").select("id, name, status").eq("workspace_id", workspaceId).order("name"),
  ]);
  if (nErr) throw nErr; if (tErr) throw tErr; if (wErr) throw wErr;

  const syncByNumber = new Map<string, { lastSync: string | null; approved: number; total: number }>();
  for (const t of tpl ?? []) {
    if (!t.whatsapp_number_id) continue;
    const cur = syncByNumber.get(t.whatsapp_number_id) ?? { lastSync: null, approved: 0, total: 0 };
    cur.total += 1;
    if (t.status === "approved") cur.approved += 1;
    if (t.synced_at && (!cur.lastSync || t.synced_at > cur.lastSync)) cur.lastSync = t.synced_at;
    syncByNumber.set(t.whatsapp_number_id, cur);
  }
  return {
    numbers: (numbers ?? []) as NumberRow[],
    syncByNumber,
    workspaces: (workspaces ?? []) as Workspace[],
    bms: (bms ?? []) as BMOption[],
  };
};

const tone = (t: "ok" | "warn" | "bad" | "muted") =>
  t === "ok" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
  : t === "warn" ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
  : t === "bad" ? "bg-red-500/15 text-red-700 border-red-500/30"
  : "bg-muted text-muted-foreground border-border";

const STATUS_TONE: Record<NumberStatus, "ok" | "warn" | "bad" | "muted"> = {
  active: "ok",
  ready: "ok",
  stock: "muted",
  warming: "warn",
  restricted: "bad",
  banned: "bad",
  draft: "muted",
  inactive: "muted",
};

const STATUS_OPTIONS: Array<[NumberStatus, string]> = [
  ["active", "Active"],
  ["ready", "Ready"],
  ["stock", "Stock"],
  ["warming", "Warming"],
  ["restricted", "Restricted (30 days)"],
  ["banned", "Banned"],
];

const statusLabel = (s: NumberStatus): string => {
  const found = STATUS_OPTIONS.find(([v]) => v === s);
  if (found) return found[1];
  if (s === "draft" || s === "inactive") return "Stock";
  return s;
};

type Readiness = { ready: boolean; reasons: string[] };
const computeReadiness = (n: NumberRow, approved: number): Readiness => {
  const reasons: string[] = [];
  if (!n.phone_number) reasons.push("no phone");
  if (!n.provider_app_id) reasons.push("no app id");
  if (!n.provider_api_key) reasons.push("no API key");
  if (!n.webhook_connected) reasons.push("webhook not connected");
  if (approved === 0) reasons.push("no approved templates");
  if (!n.is_active) reasons.push("disabled");
  if (n.status === "restricted" || n.status === "banned" || n.status === "inactive") reasons.push(`status: ${n.status}`);
  return { ready: reasons.length === 0, reasons };
};

export default function NumbersInventory({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["numbers-inventory", workspaceId],
    queryFn: () => fetchData(workspaceId),
  });
  const [drafts, setDrafts] = useState<Record<string, Partial<NumberRow>>>({});

  const numbers = data?.numbers ?? [];
  const syncByNumber = data?.syncByNumber ?? new Map();
  const workspaces = data?.workspaces ?? [];
  const bms = data?.bms ?? [];
  const workspaceName = useMemo(
    () => workspaces.find((w) => w.id === workspaceId)?.name ?? "this client",
    [workspaces, workspaceId],
  );

  const save = useMutation({
    mutationFn: async (id: string) => {
      const patch = drafts[id];
      if (!patch || Object.keys(patch).length === 0) return;
      const { error } = await supabase.from("whatsapp_numbers").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_d, id) => {
      setDrafts((p) => { const n = { ...p }; delete n[id]; return n; });
      toast.success("Saved");
      await qc.invalidateQueries({ queryKey: ["numbers-inventory", workspaceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const update = (id: string, patch: Partial<NumberRow>) =>
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          <h2 className="font-display text-xl">Numbers</h2>
          <span className="text-xs text-muted-foreground">- assigned to {workspaceName}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/fleet"><ExternalLink className="w-4 h-4 mr-1" />Manage in Fleet</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Numbers are managed centrally in <Link to="/admin/fleet" className="underline hover:text-foreground">Fleet · Numbers Registry</Link>.
        To add a new number or move one between clients, open Fleet. Status, templates and webhook for already-allocated numbers can still be edited here.
      </div>

      {numbers.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No WhatsApp numbers allocated to this client yet.
          <div className="mt-3">
            <Button asChild size="sm" variant="outline"><Link to="/admin/fleet"><ExternalLink className="w-3.5 h-3.5 mr-1" />Allocate from Fleet</Link></Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {numbers.map((n) => {
            const draft: NumberRow = { ...n, ...(drafts[n.id] ?? {}) };
            const sync = syncByNumber.get(n.id) ?? { lastSync: null, approved: 0, total: 0 };
            const ready = computeReadiness(draft, sync.approved);
            const dirty = Boolean(drafts[n.id]);
            const excludedFromLaunch = draft.status === "restricted" || draft.status === "banned" || draft.status === "inactive" || !draft.is_active;
            const country = draft.country_code || geoFromPhone(draft.phone_number);
            return (
              <div key={n.id} className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
                {/* Header row: identity + status badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-base">+{n.phone_number}</div>
                  <Badge variant="outline" className={tone("muted")}>{country || "--"}</Badge>
                  <Badge variant="outline" className={tone(STATUS_TONE[draft.status])}>
                    {draft.status === "banned" || draft.status === "restricted" ? <Ban className="w-3 h-3 mr-1 inline" /> : null}
                    {statusLabel(draft.status)}
                  </Badge>
                  <Badge variant="outline" className={tone("muted")}>use: {draft.usage_type}</Badge>
                  <Badge variant="outline" className={tone(draft.provider_api_key ? "ok" : "warn")}>
                    auth: {draft.provider_api_key ? "ok" : "missing"}
                  </Badge>
                  <Badge variant="outline" className={tone(draft.webhook_connected ? "ok" : "warn")}>
                    webhook: {draft.webhook_connected ? "connected" : "not set"}
                  </Badge>
                  <Badge variant="outline" className={tone(sync.approved > 0 ? "ok" : "warn")}>
                    templates: {sync.approved}/{sync.total} approved
                  </Badge>
                  <Badge variant="outline" className={tone(ready.ready ? "ok" : "warn")}>
                    {ready.ready ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> : <AlertTriangle className="w-3 h-3 mr-1 inline" />}
                    {ready.ready ? "ready" : "not ready"}
                  </Badge>
                  {excludedFromLaunch && (
                    <Badge variant="outline" className={tone("bad")}>
                      <XCircle className="w-3 h-3 mr-1 inline" />excluded from launch
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {dirty && (
                      <Button size="sm" onClick={() => save.mutate(n.id)} disabled={save.isPending}>
                        <Save className="w-3.5 h-3.5 mr-1" />Save
                      </Button>
                    )}
                  </div>
                </div>

                {!ready.ready && (
                  <div className="text-[11px] text-amber-700">Missing: {ready.reasons.join(", ")}</div>
                )}

                {/* Operator-facing fields only */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Country / sender label">
                    <Input value={draft.label ?? ""} onChange={(e) => update(n.id, { label: e.target.value })} placeholder="UAE main" />
                  </Field>
                  <Field label="Country code">
                    <Input value={draft.country_code ?? ""} onChange={(e) => update(n.id, { country_code: e.target.value.toUpperCase() })} placeholder="US / UK / AE" maxLength={4} />
                  </Field>
                  <Field label="Status">
                    <Select value={(draft.status === "draft" || draft.status === "inactive") ? "stock" : draft.status} onValueChange={(v) => update(n.id, { status: v as NumberStatus })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Use for">
                    <Select value={draft.usage_type} onValueChange={(v) => update(n.id, { usage_type: v as NumberUsage })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marketing">marketing</SelectItem>
                        <SelectItem value="utility">utility</SelectItem>
                        <SelectItem value="both">both</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* Webhook URL - copy & paste into Gupshup manually */}
                <WebhookUrlRow
                  numberId={n.id}
                  connected={draft.webhook_connected}
                  onMarkConnected={async () => {
                    update(n.id, { webhook_connected: !draft.webhook_connected });
                    await supabase.from("whatsapp_numbers").update({ webhook_connected: !draft.webhook_connected }).eq("id", n.id);
                    await qc.invalidateQueries({ queryKey: ["numbers-inventory", workspaceId] });
                  }}
                />

                {/* Technical / advanced (collapsed by default) */}
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground select-none">Technical setup (phone, app id, API key, BM)</summary>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                    <Field label="Phone (digits)"><Input value={draft.phone_number} onChange={(e) => update(n.id, { phone_number: e.target.value.replace(/[^\d]/g, "") })} /></Field>
                    <Field label="Gupshup app ID"><Input value={draft.provider_app_id ?? ""} onChange={(e) => update(n.id, { provider_app_id: e.target.value })} /></Field>
                    <Field label="API key"><Input value={draft.provider_api_key ?? ""} onChange={(e) => update(n.id, { provider_api_key: e.target.value })} placeholder="leave blank to use global" /></Field>
                    <Field label="Gupshup app name"><Input value={draft.display_name ?? ""} onChange={(e) => update(n.id, { display_name: e.target.value })} placeholder="01Ashik02" /></Field>
                    <Field label="Partner / source"><Input value={draft.partner_source ?? ""} onChange={(e) => update(n.id, { partner_source: e.target.value })} /></Field>
                    <Field label="Business Manager">
                      <div className="flex gap-1">
                        <Select
                          value={draft.business_manager_id ?? "__none"}
                          onValueChange={(v) => update(n.id, { business_manager_id: v === "__none" ? null : v })}
                        >
                          <SelectTrigger className="flex-1"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">None</SelectItem>
                            {bms.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.name} {b.status !== "active" ? `· ${b.status}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {draft.business_manager_id && (
                          <Button asChild size="sm" variant="ghost" className="px-2">
                            <Link to={`/admin/business-managers/${draft.business_manager_id}`} title="Open BM">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </Field>
                  </div>
                </details>

                <Field label="Notes">
                  <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => update(n.id, { notes: e.target.value })} placeholder="Internal notes - issues, history, who set it up" />
                </Field>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</label>{children}</div>
);

const WebhookUrlRow = ({
  numberId: _numberId,
  connected,
  onMarkConnected,
}: {
  numberId: string;
  connected: boolean;
  onMarkConnected: () => void;
}) => {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Webhook URL copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copy failed - select and copy manually");
    }
  };
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Inbound webhook URL</span>
        <button
          type="button"
          onClick={onMarkConnected}
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          {connected ? "Mark as not connected" : "Mark as connected"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] px-2 py-1.5 rounded bg-background border border-border break-all font-mono">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <><Check className="w-3.5 h-3.5 mr-1" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1" />Copy</>}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Paste this into the Gupshup app - Callback URL. Then click "Mark as connected" so this number counts as ready.
      </p>
    </div>
  );
};

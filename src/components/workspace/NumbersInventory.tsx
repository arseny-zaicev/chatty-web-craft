import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Phone, Plus, RefreshCw, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type NumberRow = {
  id: string;
  workspace_id: string;
  phone_number: string;
  display_name: string | null;
  label: string | null;
  partner_source: string | null;
  bm_name: string | null;
  notes: string | null;
  provider_app_id: string | null;
  provider_api_key: string | null;
  is_active: boolean;
  connected_in_gupshup: boolean;
  connected_in_iskra: boolean;
};

type Allocation = { whatsapp_number_id: string; campaign_id: string; campaign_name: string; status: string };

const fetchData = async (workspaceId: string) => {
  const [{ data: numbers, error: nErr }, { data: campaigns, error: cErr }, { data: tpl, error: tErr }] = await Promise.all([
    supabase.from("whatsapp_numbers").select("id, workspace_id, phone_number, display_name, label, partner_source, bm_name, notes, provider_app_id, provider_api_key, is_active, connected_in_gupshup, connected_in_iskra").eq("workspace_id", workspaceId),
    supabase.from("campaigns").select("id, name, status, whatsapp_number_id").eq("workspace_id", workspaceId).in("status", ["draft", "scheduled", "running", "paused"]),
    supabase.from("message_templates").select("whatsapp_number_id, status, synced_at").eq("workspace_id", workspaceId),
  ]);
  if (nErr) throw nErr; if (cErr) throw cErr; if (tErr) throw tErr;
  const allocations: Allocation[] = (campaigns ?? []).map((c) => ({
    whatsapp_number_id: c.whatsapp_number_id,
    campaign_id: c.id,
    campaign_name: c.name,
    status: c.status,
  }));
  // For each number, latest sync time + approved template count
  const syncByNumber = new Map<string, { lastSync: string | null; approved: number; total: number }>();
  for (const t of tpl ?? []) {
    if (!t.whatsapp_number_id) continue;
    const cur = syncByNumber.get(t.whatsapp_number_id) ?? { lastSync: null, approved: 0, total: 0 };
    cur.total += 1;
    if (t.status === "approved") cur.approved += 1;
    if (t.synced_at && (!cur.lastSync || t.synced_at > cur.lastSync)) cur.lastSync = t.synced_at;
    syncByNumber.set(t.whatsapp_number_id, cur);
  }
  return { numbers: (numbers ?? []) as NumberRow[], allocations, syncByNumber };
};

const apiKeyStatus = (k: string | null) => {
  if (!k) return { label: "global fallback", tone: "warn" as const };
  if (k.startsWith("sk_")) return { label: "partner key (fallback)", tone: "warn" as const };
  return { label: "app key set", tone: "ok" as const };
};

const workStatus = (n: NumberRow, running: number) => {
  if (!n.is_active) return { label: "blocked", tone: "bad" as const };
  if (running > 0) return { label: `in use (${running})`, tone: "ok" as const };
  return { label: "idle", tone: "warn" as const };
};

const launchReadiness = (n: NumberRow, gup: boolean, iskra: boolean) => {
  const reasons: string[] = [];
  if (!n.is_active) reasons.push("disabled");
  if (!gup) reasons.push("not in Gupshup");
  if (!iskra) reasons.push("not in ISKRA");
  if (!n.provider_app_id) reasons.push("no app id");
  if (!n.phone_number) reasons.push("no phone");
  if (reasons.length === 0) return { label: "ready", tone: "ok" as const, reasons };
  return { label: "not ready", tone: reasons.length > 1 ? "bad" as const : "warn" as const, reasons };
};

const tone = (t: "ok" | "warn" | "bad") =>
  t === "ok" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
  : t === "warn" ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
  : "bg-red-500/15 text-red-700 border-red-500/30";

export default function NumbersInventory({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["numbers-inventory", workspaceId],
    queryFn: () => fetchData(workspaceId),
  });
  const [drafts, setDrafts] = useState<Record<string, Partial<NumberRow>>>({});
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const numbers = data?.numbers ?? [];
  const allocs = data?.allocations ?? [];
  const syncByNumber = data?.syncByNumber ?? new Map<string, { lastSync: string | null; approved: number; total: number }>();

  const runningByNumber = useMemo(() => {
    const m = new Map<string, Allocation[]>();
    for (const a of allocs) {
      if (!m.has(a.whatsapp_number_id)) m.set(a.whatsapp_number_id, []);
      m.get(a.whatsapp_number_id)!.push(a);
    }
    return m;
  }, [allocs]);

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

  const addNumber = useMutation({
    mutationFn: async () => {
      if (!newPhone.trim()) throw new Error("Phone required");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in");
      const { error } = await supabase.from("whatsapp_numbers").insert({
        workspace_id: workspaceId,
        user_id: auth.user.id,
        phone_number: newPhone.replace(/[^\d]/g, ""),
        label: newLabel || null,
        display_name: newLabel || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNewPhone(""); setNewLabel(""); setAdding(false);
      toast.success("Number added");
      await qc.invalidateQueries({ queryKey: ["numbers-inventory", workspaceId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed"),
  });

  const update = (id: string, patch: Partial<NumberRow>) =>
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Phone className="w-5 h-5 text-primary" /><h2 className="font-display text-xl">Numbers inventory</h2></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
          <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="w-4 h-4 mr-1" />Add number</Button>
        </div>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card/30 p-3 flex flex-wrap gap-2 items-end">
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Phone (digits only)</label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="971500000000" className="w-48" /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Label</label><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="UAE main" className="w-48" /></div>
          <Button size="sm" onClick={() => addNumber.mutate()} disabled={addNumber.isPending}>{addNumber.isPending ? "Adding..." : "Save"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}

      {numbers.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">No WhatsApp numbers in this client.</div>
      ) : (
        <div className="space-y-3">
          {numbers.map((n) => {
            const draft: NumberRow = { ...n, ...(drafts[n.id] ?? {}) };
            const running = runningByNumber.get(n.id) ?? [];
            const sync = syncByNumber.get(n.id) ?? { lastSync: null, approved: 0, total: 0 };
            const inGupshup = Boolean(draft.provider_app_id) && (sync.total > 0 || Boolean(draft.provider_api_key));
            const inIskra = Boolean(draft.phone_number) && Boolean(draft.provider_app_id);
            const key = apiKeyStatus(draft.provider_api_key);
            const work = workStatus(draft, running.length);
            const ready = launchReadiness(draft, inGupshup, inIskra);
            const dirty = Boolean(drafts[n.id]);
            return (
              <div key={n.id} className="rounded-lg border border-border bg-card/30 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-base">+{n.phone_number}</div>
                  <Badge variant="outline" className={`text-[10px] ${tone(key.tone)}`}>API key: {key.label}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${tone(work.tone)}`}>{work.label}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${tone(inGupshup ? "ok" : "warn")}`}>Gupshup: {inGupshup ? "connected" : "unconfirmed"}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${tone(inIskra ? "ok" : "warn")}`}>ISKRA: {inIskra ? "connected" : "incomplete"}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${tone(ready.tone)}`}>
                    {ready.tone === "ok" ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> : ready.tone === "bad" ? <XCircle className="w-3 h-3 mr-1 inline" /> : <AlertTriangle className="w-3 h-3 mr-1 inline" />}
                    launch: {ready.label}
                  </Badge>
                  {ready.reasons.length > 0 && <span className="text-[11px] text-muted-foreground">({ready.reasons.join(", ")})</span>}
                  <div className="ml-auto flex items-center gap-2">
                    {sync.lastSync && (
                      <span className="text-[11px] text-muted-foreground">templates {sync.approved}/{sync.total} approved · synced {new Date(sync.lastSync).toLocaleString()}</span>
                    )}
                    {running.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">campaigns: {running.map((r) => r.campaign_name).join(", ")}</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!draft.provider_app_id}
                      onClick={async () => {
                        const t = toast.loading("Registering Gupshup callback...");
                        const { data, error } = await supabase.functions.invoke("gupshup-set-callback", { body: { number_id: n.id } });
                        toast.dismiss(t);
                        if (error || !data?.ok) {
                          toast.error("Could not auto-set callback. Set manually in Gupshup app settings.");
                          console.warn("set-callback result", data, error);
                        } else {
                          toast.success("Gupshup callback set");
                          await qc.invalidateQueries({ queryKey: ["numbers-inventory", workspaceId] });
                        }
                      }}
                    >
                      Set Gupshup callback
                    </Button>
                    {dirty && (
                      <Button size="sm" onClick={() => save.mutate(n.id)} disabled={save.isPending}>
                        <Save className="w-3.5 h-3.5 mr-1" />Save
                      </Button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground break-all">
                  Inbound webhook URL (paste into Gupshup app → Callback URL if auto-set fails):
                  <code className="ml-1 px-1 py-0.5 rounded bg-muted">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`}</code>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field label="Label"><Input value={draft.label ?? ""} onChange={(e) => update(n.id, { label: e.target.value })} /></Field>
                  <Field label="Partner / Source"><Input value={draft.partner_source ?? ""} onChange={(e) => update(n.id, { partner_source: e.target.value })} placeholder="Gupshup, 360dialog, etc." /></Field>
                  <Field label="BM name"><Input value={draft.bm_name ?? ""} onChange={(e) => update(n.id, { bm_name: e.target.value })} placeholder="Business Manager" /></Field>
                  <Field label="Display name"><Input value={draft.display_name ?? ""} onChange={(e) => update(n.id, { display_name: e.target.value })} /></Field>
                  <Field label="Phone (digits)"><Input value={draft.phone_number} onChange={(e) => update(n.id, { phone_number: e.target.value.replace(/[^\d]/g, "") })} /></Field>
                  <Field label="App ID"><Input value={draft.provider_app_id ?? ""} onChange={(e) => update(n.id, { provider_app_id: e.target.value })} /></Field>
                  <Field label="API key (per-number)"><Input value={draft.provider_api_key ?? ""} onChange={(e) => update(n.id, { provider_api_key: e.target.value })} placeholder="leave blank to use global key" /></Field>
                  <div className="flex items-end">
                    <Toggle label="Active (sending allowed)" checked={draft.is_active} onChange={(v) => update(n.id, { is_active: v })} />
                  </div>
                </div>

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

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
    <span>{label}</span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);

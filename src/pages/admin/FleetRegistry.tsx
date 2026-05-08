import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, ArrowLeft, Search, ExternalLink, Plus, Phone, Layers, Building2, Inbox as InboxIcon, Pencil, Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { geoFromPhone } from "@/lib/launchData";

const ADMIN_EMAIL = "arseny@iskra.ae";

type Status = "draft" | "ready" | "warming" | "restricted" | "banned" | "inactive";
type Usage = "marketing" | "utility" | "both";

type Row = {
  id: string;
  phone_number: string;
  display_name: string | null;
  label: string | null;
  status: Status;
  usage_type: Usage;
  country_code: string | null;
  webhook_connected: boolean;
  is_active: boolean;
  provider_app_id: string | null;
  provider_api_key: string | null;
  provider_waba_id: string | null;
  profile_avatar: string | null;
  messaging_limit: string | null;
  is_warming: boolean;
  provided_by: string | null;
  assigned_ref: string | null;
  partner_source: string | null;
  notes: string | null;
  workspace_id: string | null;
  workspace_name: string;
  workspace_slug: string;
  templates_total: number;
  templates_approved: number;
  last_inbound: string | null;
  last_outbound: string | null;
  last_error: string | null;
};

type WS = { id: string; name: string; slug: string };

const fetchFleet = async (): Promise<{ rows: Row[]; workspaces: WS[] }> => {
  const [{ data: numbers, error: nErr }, { data: workspaces, error: wErr }, { data: templates }, { data: convs }, { data: lastEvents }] =
    await Promise.all([
      supabase.from("whatsapp_numbers").select("*"),
      supabase.from("workspaces").select("id, name, slug").eq("is_active", true).order("name"),
      supabase.from("message_templates").select("whatsapp_number_id, status"),
      supabase.from("conversations").select("whatsapp_number_id, last_message_at"),
      supabase.from("whatsapp_message_events")
        .select("whatsapp_number_id, event_type, error_message, received_at")
        .order("received_at", { ascending: false }).limit(2000),
    ]);
  if (nErr) throw nErr; if (wErr) throw wErr;

  const wsMap = new Map((workspaces ?? []).map((w) => [w.id, w]));
  const tpl = new Map<string, { total: number; approved: number }>();
  for (const t of templates ?? []) {
    if (!t.whatsapp_number_id) continue;
    const cur = tpl.get(t.whatsapp_number_id) ?? { total: 0, approved: 0 };
    cur.total += 1;
    if (t.status === "approved") cur.approved += 1;
    tpl.set(t.whatsapp_number_id, cur);
  }
  const lastInbound = new Map<string, string>();
  for (const c of convs ?? []) {
    if (!c.whatsapp_number_id || !c.last_message_at) continue;
    const cur = lastInbound.get(c.whatsapp_number_id);
    if (!cur || c.last_message_at > cur) lastInbound.set(c.whatsapp_number_id, c.last_message_at);
  }
  const lastOutbound = new Map<string, string>();
  const lastError = new Map<string, string>();
  for (const e of lastEvents ?? []) {
    if (!e.whatsapp_number_id) continue;
    if ((e.event_type === "sent" || e.event_type === "enqueued" || e.event_type === "delivered") && !lastOutbound.has(e.whatsapp_number_id)) {
      lastOutbound.set(e.whatsapp_number_id, e.received_at);
    }
    if ((e.event_type === "failed" || e.event_type === "error") && e.error_message && !lastError.has(e.whatsapp_number_id)) {
      lastError.set(e.whatsapp_number_id, e.error_message);
    }
  }

  const rows: Row[] = (numbers ?? []).map((n: Record<string, unknown>) => {
    const ws = n.workspace_id ? wsMap.get(n.workspace_id as string) : null;
    const t = tpl.get(n.id as string) ?? { total: 0, approved: 0 };
    return {
      id: n.id as string,
      phone_number: n.phone_number as string,
      display_name: (n.display_name as string) ?? null,
      label: (n.label as string) ?? null,
      status: (n.status as Status) ?? "draft",
      usage_type: (n.usage_type as Usage) ?? "both",
      country_code: (n.country_code as string) ?? null,
      webhook_connected: Boolean(n.webhook_connected),
      is_active: Boolean(n.is_active),
      provider_app_id: (n.provider_app_id as string) ?? null,
      provider_api_key: (n.provider_api_key as string) ?? null,
      provider_waba_id: (n.provider_waba_id as string) ?? null,
      profile_avatar: (n.profile_avatar as string) ?? null,
      messaging_limit: (n.messaging_limit as string) ?? null,
      is_warming: Boolean(n.is_warming),
      provided_by: (n.provided_by as string) ?? null,
      assigned_ref: (n.assigned_ref as string) ?? null,
      partner_source: (n.partner_source as string) ?? null,
      notes: (n.notes as string) ?? null,
      workspace_id: (n.workspace_id as string) ?? null,
      workspace_name: ws?.name ?? "Unassigned",
      workspace_slug: ws?.slug ?? "",
      templates_total: t.total,
      templates_approved: t.approved,
      last_inbound: lastInbound.get(n.id as string) ?? null,
      last_outbound: lastOutbound.get(n.id as string) ?? null,
      last_error: lastError.get(n.id as string) ?? null,
    };
  });

  return { rows, workspaces: (workspaces ?? []) as WS[] };
};

const statusTone: Record<Status, string> = {
  ready: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  warming: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  draft: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
  restricted: "bg-red-500/15 text-red-700 border-red-500/30",
  banned: "bg-red-500/15 text-red-700 border-red-500/30",
};

type ViewMode = "all" | "by-client" | "unassigned";

export default function FleetRegistry() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [adderOpen, setAdderOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  useEffect(() => {
    const guard = (u: User | null) => {
      if (!u) { navigate("/admin-auth"); return; }
      if (u.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        supabase.auth.signOut(); navigate("/admin-auth"); toast.error("Admin only"); return;
      }
      setAuthChecked(true);
    };
    supabase.auth.getSession().then(({ data: { session } }) => guard(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => guard(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["fleet-registry"],
    queryFn: fetchFleet,
    enabled: authChecked,
  });
  const rows = data?.rows ?? [];
  const workspaces = data?.workspaces ?? [];

  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fUsage, setFUsage] = useState<string>("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === "unassigned" && r.workspace_id !== null) return false;
      if (fStatus !== "all" && r.status !== fStatus) return false;
      if (fUsage !== "all" && r.usage_type !== fUsage) return false;
      if (term) {
        const hay = `${r.phone_number} ${r.display_name ?? ""} ${r.label ?? ""} ${r.workspace_name} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, view, fStatus, fUsage]);

  // Reassign / unassign
  const reassign = useMutation({
    mutationFn: async ({ id, workspaceId }: { id: string; workspaceId: string | null }) => {
      const { error } = await supabase.from("whatsapp_numbers").update({ workspace_id: workspaceId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Allocation updated");
      await qc.invalidateQueries({ queryKey: ["fleet-registry"] });
      await qc.invalidateQueries({ queryKey: ["numbers-inventory"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  if (!authChecked || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const unassignedCount = rows.filter((r) => r.workspace_id === null).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Link></Button>
          <h1 className="font-display text-lg font-semibold">Fleet · Numbers Registry</h1>
          <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length}</span>
          {unassignedCount > 0 && view !== "unassigned" && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
              {unassignedCount} unassigned
            </Badge>
          )}
          <div className="ml-auto">
            <Button size="sm" onClick={() => setAdderOpen(true)}><Plus className="w-4 h-4 mr-1" />Add number</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <ViewTab active={view === "all"} onClick={() => setView("all")} icon={<Layers className="w-3.5 h-3.5" />}>All numbers</ViewTab>
          <ViewTab active={view === "by-client"} onClick={() => setView("by-client")} icon={<Building2 className="w-3.5 h-3.5" />}>Group by client</ViewTab>
          <ViewTab active={view === "unassigned"} onClick={() => setView("unassigned")} icon={<InboxIcon className="w-3.5 h-3.5" />}>
            Unassigned{unassignedCount > 0 ? ` · ${unassignedCount}` : ""}
          </ViewTab>

          <div className="w-px h-6 bg-border mx-1" />

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 w-56" placeholder="Search phone, label..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <FilterSelect value={fStatus} onChange={setFStatus} placeholder="All statuses" options={[["all", "All statuses"], ["ready", "ready"], ["warming", "warming"], ["draft", "draft"], ["restricted", "restricted"], ["banned", "banned"], ["inactive", "inactive"]]} />
          <FilterSelect value={fUsage} onChange={setFUsage} placeholder="All use cases" options={[["all", "All use cases"], ["marketing", "marketing"], ["utility", "utility"], ["both", "both"]]} />
        </div>

        {view === "by-client" ? (
          <GroupedByClient rows={filtered} workspaces={workspaces} onReassign={(id, wid) => reassign.mutate({ id, workspaceId: wid })} />
        ) : (
          <FleetTable rows={filtered} workspaces={workspaces} onReassign={(id, wid) => reassign.mutate({ id, workspaceId: wid })} />
        )}
      </main>

      <AddNumberDrawer open={adderOpen} onOpenChange={setAdderOpen} workspaces={workspaces}
        onCreated={async () => { await qc.invalidateQueries({ queryKey: ["fleet-registry"] }); }} />
    </div>
  );
}

const ViewTab = ({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick} className="gap-1.5">{icon}{children}</Button>
);

const FilterSelect = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: Array<[string, string]>; placeholder: string }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-44 h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
  </Select>
);

function FleetTable({ rows, workspaces, onReassign }: { rows: Row[]; workspaces: WS[]; onReassign: (id: string, workspaceId: string | null) => void }) {
  return (
    <div className="rounded-lg border border-border bg-card/30 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <FleetHeaders showClient />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={20} className="text-center text-sm text-muted-foreground py-10">No numbers match the filters.</TableCell></TableRow>
          ) : rows.map((r) => <FleetRowView key={r.id} r={r} workspaces={workspaces} onReassign={onReassign} />)}
        </TableBody>
      </Table>
    </div>
  );
}

function GroupedByClient({ rows, workspaces, onReassign }: { rows: Row[]; workspaces: WS[]; onReassign: (id: string, workspaceId: string | null) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, { ws: WS | null; rows: Row[] }>();
    for (const r of rows) {
      const key = r.workspace_id ?? "__unassigned__";
      if (!map.has(key)) {
        const ws = r.workspace_id ? workspaces.find((w) => w.id === r.workspace_id) ?? null : null;
        map.set(key, { ws, rows: [] });
      }
      map.get(key)!.rows.push(r);
    }
    const arr = Array.from(map.entries());
    arr.sort(([a], [b]) => (a === "__unassigned__" ? -1 : b === "__unassigned__" ? 1 : 0));
    return arr;
  }, [rows, workspaces]);

  if (groups.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No numbers match the filters.</div>;
  }

  return (
    <div className="space-y-4">
      {groups.map(([key, g]) => (
        <div key={key} className="rounded-lg border border-border bg-card/30 overflow-x-auto">
          <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 text-sm">
            {g.ws ? (
              <>
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                <Link to={`/ws/${g.ws.slug}/overview`} className="font-medium hover:underline">{g.ws.name}</Link>
                <span className="text-xs text-muted-foreground">/{g.ws.slug}</span>
              </>
            ) : (
              <>
                <InboxIcon className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-medium text-amber-700">Unassigned</span>
                <span className="text-xs text-muted-foreground">- not yet allocated to any client</span>
              </>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{g.rows.length} number{g.rows.length === 1 ? "" : "s"}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <FleetHeaders showClient={false} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.rows.map((r) => <FleetRowView key={r.id} r={r} workspaces={workspaces} onReassign={onReassign} hideClientCol />)}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function FleetHeaders({ showClient }: { showClient: boolean }) {
  return (
    <>
      <TableHead>Phone</TableHead>
      <TableHead>App name</TableHead>
      <TableHead>Display name</TableHead>
      <TableHead>Avatar</TableHead>
      <TableHead>App ID</TableHead>
      <TableHead>API key</TableHead>
      <TableHead>WABA ID</TableHead>
      <TableHead>Limit</TableHead>
      {showClient && <TableHead>Client</TableHead>}
      <TableHead>Warm</TableHead>
      <TableHead>Use</TableHead>
      <TableHead>Provided by</TableHead>
      <TableHead>Country</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Auth</TableHead>
      <TableHead>Webhook</TableHead>
      <TableHead>Templates</TableHead>
      <TableHead>Last in</TableHead>
      <TableHead>Last out</TableHead>
      <TableHead>Last error</TableHead>
      <TableHead></TableHead>
    </>
  );
}

function MaskedCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tail = value.length > 4 ? value.slice(-4) : value;
  return <span className="font-mono text-[11px] text-muted-foreground" title={value}>••••{tail}</span>;
}

function TruncCell({ value, max = 140 }: { value: string | null; max?: number }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className="font-mono text-[11px] text-muted-foreground truncate inline-block align-middle" style={{ maxWidth: max }} title={value}>{value}</span>;
}

function FleetRowView({ r, workspaces, onReassign, hideClientCol }: { r: Row; workspaces: WS[]; onReassign: (id: string, workspaceId: string | null) => void; hideClientCol?: boolean }) {
  const auth = r.provider_api_key && r.provider_app_id ? "ready" : "missing";
  const wh = r.webhook_connected ? "connected" : "missing";
  const providedBy = [r.provided_by, r.assigned_ref ? `Ref ${r.assigned_ref}` : null].filter(Boolean).join(" | ") || r.partner_source;
  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">+{r.phone_number}</TableCell>
      <TableCell className="text-xs">{r.label ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="text-xs">{r.display_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="text-xs capitalize">{r.profile_avatar ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell><TruncCell value={r.provider_app_id} max={120} /></TableCell>
      <TableCell><MaskedCell value={r.provider_api_key} /></TableCell>
      <TableCell><TruncCell value={r.provider_waba_id} max={120} /></TableCell>
      <TableCell className="text-xs">{r.messaging_limit ?? <span className="text-muted-foreground">—</span>}</TableCell>
      {!hideClientCol && (
        <TableCell className="text-xs">
          {r.workspace_id ? (
            <Link to={`/ws/${r.workspace_slug}/settings`} className="hover:underline">{r.workspace_name}</Link>
          ) : (
            <span className="text-amber-700">Unassigned</span>
          )}
        </TableCell>
      )}
      <TableCell>
        {r.is_warming
          ? <Badge variant="outline" className={`text-[10px] ${statusTone.warming}`}>warming</Badge>
          : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs">{r.usage_type}</TableCell>
      <TableCell className="text-xs">{providedBy ?? <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="text-xs">{r.country_code ?? geoFromPhone(r.phone_number) ?? "—"}</TableCell>
      <TableCell><Badge variant="outline" className={`text-[10px] ${statusTone[r.status]}`}>{r.status}</Badge></TableCell>
      <TableCell><Badge variant="outline" className={`text-[10px] ${auth === "ready" ? statusTone.ready : statusTone.warming}`}>{auth}</Badge></TableCell>
      <TableCell><Badge variant="outline" className={`text-[10px] ${wh === "connected" ? statusTone.ready : statusTone.warming}`}>{wh}</Badge></TableCell>
      <TableCell className="text-xs">{r.templates_approved}/{r.templates_total}</TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.last_inbound ? formatDistanceToNow(new Date(r.last_inbound), { addSuffix: true }) : "—"}</TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.last_outbound ? formatDistanceToNow(new Date(r.last_outbound), { addSuffix: true }) : "—"}</TableCell>
      <TableCell className="text-xs text-red-600 max-w-[180px] truncate" title={r.last_error ?? ""}>{r.last_error ?? "—"}</TableCell>
      <TableCell>
        {r.workspace_slug ? (
          <Button asChild size="sm" variant="ghost"><Link to={`/ws/${r.workspace_slug}/settings`}><ExternalLink className="w-3.5 h-3.5" /></Link></Button>
        ) : (
          <ReassignInline value={r.workspace_id} workspaces={workspaces} onChange={(wid) => onReassign(r.id, wid)} />
        )}
      </TableCell>
    </TableRow>
  );
}

function ReassignInline({ value, workspaces, onChange }: { value: string | null; workspaces: WS[]; onChange: (v: string | null) => void }) {
  return (
    <Select value={value ?? "__unassigned__"} onValueChange={(v) => onChange(v === "__unassigned__" ? null : v)}>
      <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Allocate" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__unassigned__">Unassigned</SelectItem>
        {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Add Number drawer ---------------------------------------------------------
function AddNumberDrawer({
  open, onOpenChange, workspaces, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; workspaces: WS[]; onCreated: () => Promise<void> | void }) {
  const [phone, setPhone] = useState("");
  const [appName, setAppName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<"man" | "woman" | "">("");
  const [appId, setAppId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [messagingLimit, setMessagingLimit] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string>("__unassigned__");
  const [isWarming, setIsWarming] = useState(false);
  const [usage, setUsage] = useState<Usage>("both");
  const [providedBy, setProvidedBy] = useState("");
  const [assignedRef, setAssignedRef] = useState("");

  const reset = () => {
    setPhone(""); setAppName(""); setDisplayName(""); setProfileAvatar("");
    setAppId(""); setApiKey(""); setWabaId(""); setMessagingLimit("");
    setWorkspaceId("__unassigned__"); setIsWarming(false); setUsage("both");
    setProvidedBy(""); setAssignedRef("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const cleanPhone = phone.replace(/[^\d]/g, "");
      if (!cleanPhone) throw new Error("Phone is required");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in required");

      const { data: existing } = await supabase.from("whatsapp_numbers")
        .select("id").eq("phone_number", cleanPhone).maybeSingle();
      if (existing) throw new Error(`+${cleanPhone} already exists in Fleet.`);

      const targetWs = workspaceId === "__unassigned__" ? null : workspaceId;
      const { error } = await supabase.from("whatsapp_numbers").insert({
        user_id: auth.user.id,
        workspace_id: targetWs,
        phone_number: cleanPhone,
        label: appName || null,
        display_name: displayName || appName || null,
        country_code: geoFromPhone(cleanPhone) || null,
        provider_app_id: appId || null,
        provider_api_key: apiKey || null,
        provider_waba_id: wabaId || null,
        profile_avatar: profileAvatar || null,
        messaging_limit: messagingLimit || null,
        is_warming: isWarming,
        provided_by: providedBy || null,
        assigned_ref: assignedRef || null,
        usage_type: usage,
        status: isWarming ? "warming" : "draft",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Number added to Fleet");
      reset();
      onOpenChange(false);
      await onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Add failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" />Add WhatsApp number</DialogTitle>
          <DialogDescription>
            Numbers are managed centrally in Fleet. Save as Unassigned now and allocate later, or pick a client below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Phone (digits only)" required>
            <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))} placeholder="971500000000" />
          </Field>

          <Field label="App name">
            <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="01Ashik02" />
          </Field>

          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Iskra Sales" />
          </Field>

          <Field label="Profile picture">
            <div className="flex gap-2">
              <Button type="button" variant={profileAvatar === "man" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setProfileAvatar("man")}>Man</Button>
              <Button type="button" variant={profileAvatar === "woman" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setProfileAvatar("woman")}>Woman</Button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="App ID">
              <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="uuid" />
            </Field>
            <Field label="API key">
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk_..." />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="WABA ID">
              <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WABA ID" />
            </Field>
            <Field label="Messaging limit">
              <Select value={messagingLimit} onValueChange={setMessagingLimit}>
                <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="250">250 / day</SelectItem>
                  <SelectItem value="1000">1 000 / day</SelectItem>
                  <SelectItem value="10000">10 000 / day</SelectItem>
                  <SelectItem value="100000">100 000 / day</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Allocate to client">
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Unassigned (stock / warming / future client)</SelectItem>
                {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Warming</div>
              <div className="text-xs text-muted-foreground">Mark this number as currently warming up.</div>
            </div>
            <Switch checked={isWarming} onCheckedChange={setIsWarming} />
          </div>

          <Field label="Use for">
            <Select value={usage} onValueChange={(v) => setUsage(v as Usage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="utility">Utility</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Provided by">
              <Input value={providedBy} onChange={(e) => setProvidedBy(e.target.value)} placeholder="Kartik" />
            </Field>
            <Field label="Ref">
              <Input value={assignedRef} onChange={(e) => setAssignedRef(e.target.value)} placeholder="Nitish" />
            </Field>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !phone}>
            {create.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">{title}</div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-xs text-muted-foreground">{label}{required ? <span className="text-red-500"> *</span> : null}</label>
    {children}
  </div>
);

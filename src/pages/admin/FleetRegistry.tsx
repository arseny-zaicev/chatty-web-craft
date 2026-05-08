import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Search, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";

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
  notes: string | null;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  templates_total: number;
  templates_approved: number;
  last_inbound: string | null;
  last_outbound: string | null;
  last_error: string | null;
};

const fetchFleet = async (): Promise<Row[]> => {
  const [
    { data: numbers, error: nErr },
    { data: workspaces, error: wErr },
    { data: templates },
    { data: convs },
    { data: lastEvents },
  ] = await Promise.all([
    supabase.from("whatsapp_numbers").select("*"),
    supabase.from("workspaces").select("id, name, slug"),
    supabase.from("message_templates").select("whatsapp_number_id, status"),
    supabase.from("conversations").select("whatsapp_number_id, last_message_at"),
    supabase
      .from("whatsapp_message_events")
      .select("whatsapp_number_id, event_type, error_message, received_at")
      .order("received_at", { ascending: false })
      .limit(2000),
  ]);
  if (nErr) throw nErr;
  if (wErr) throw wErr;

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

  return (numbers ?? []).map((n: Record<string, unknown>) => {
    const ws = wsMap.get(n.workspace_id as string);
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
      notes: (n.notes as string) ?? null,
      workspace_id: n.workspace_id as string,
      workspace_name: ws?.name ?? "—",
      workspace_slug: ws?.slug ?? "",
      templates_total: t.total,
      templates_approved: t.approved,
      last_inbound: lastInbound.get(n.id as string) ?? null,
      last_outbound: lastOutbound.get(n.id as string) ?? null,
      last_error: lastError.get(n.id as string) ?? null,
    };
  });
};

const statusTone: Record<Status, string> = {
  ready: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  warming: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  draft: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
  restricted: "bg-red-500/15 text-red-700 border-red-500/30",
  banned: "bg-red-500/15 text-red-700 border-red-500/30",
};

export default function FleetRegistry() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const guard = (u: User | null) => {
      if (!u) { navigate("/admin-auth"); return; }
      if (u.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        supabase.auth.signOut();
        navigate("/admin-auth");
        toast.error("Admin only");
        return;
      }
      setAuthChecked(true);
    };
    supabase.auth.getSession().then(({ data: { session } }) => guard(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => guard(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, [navigate]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["fleet-registry"],
    queryFn: fetchFleet,
    enabled: authChecked,
  });

  const [q, setQ] = useState("");
  const [fWs, setFWs] = useState<string>("all");
  const [fCountry, setFCountry] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fUsage, setFUsage] = useState<string>("all");

  const wsOptions = useMemo(
    () => Array.from(new Map(rows.map((r) => [r.workspace_id, r.workspace_name])).entries()),
    [rows],
  );
  const countryOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.country_code).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fWs !== "all" && r.workspace_id !== fWs) return false;
      if (fCountry !== "all" && (r.country_code ?? "") !== fCountry) return false;
      if (fStatus !== "all" && r.status !== fStatus) return false;
      if (fUsage !== "all" && r.usage_type !== fUsage) return false;
      if (term) {
        const hay = `${r.phone_number} ${r.display_name ?? ""} ${r.label ?? ""} ${r.workspace_name} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, fWs, fCountry, fStatus, fUsage]);

  if (!authChecked || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Link></Button>
          <h1 className="font-display text-lg font-semibold">Fleet · Numbers Registry</h1>
          <span className="text-xs text-muted-foreground">{filtered.length} of {rows.length}</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 w-64" placeholder="Search phone, label, client..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <FilterSelect value={fWs} onChange={setFWs} placeholder="All clients" options={[["all", "All clients"], ...wsOptions]} />
          <FilterSelect value={fCountry} onChange={setFCountry} placeholder="All countries" options={[["all", "All countries"], ...countryOptions.map((c) => [c, c] as [string, string])]} />
          <FilterSelect value={fStatus} onChange={setFStatus} placeholder="All statuses" options={[["all", "All statuses"], ["ready", "ready"], ["warming", "warming"], ["draft", "draft"], ["restricted", "restricted"], ["banned", "banned"], ["inactive", "inactive"]]} />
          <FilterSelect value={fUsage} onChange={setFUsage} placeholder="All use cases" options={[["all", "All use cases"], ["marketing", "marketing"], ["utility", "utility"], ["both", "both"]]} />
        </div>

        <div className="rounded-lg border border-border bg-card/30 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Use</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Templates</TableHead>
                <TableHead>Last in</TableHead>
                <TableHead>Last out</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-10">No numbers match the filters.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const auth = r.provider_api_key && r.provider_app_id ? "ready" : "missing";
                const wh = r.webhook_connected ? "connected" : "missing";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">+{r.phone_number}{r.label ? <div className="text-[10px] text-muted-foreground">{r.label}</div> : null}</TableCell>
                    <TableCell className="text-xs">
                      <Link to={`/ws/${r.workspace_slug}/settings`} className="hover:underline">{r.workspace_name}</Link>
                    </TableCell>
                    <TableCell className="text-xs">{r.country_code ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.usage_type}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${statusTone[r.status]}`}>{r.status}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${auth === "ready" ? statusTone.ready : statusTone.warming}`}>{auth}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${wh === "connected" ? statusTone.ready : statusTone.warming}`}>{wh}</Badge></TableCell>
                    <TableCell className="text-xs">{r.templates_approved}/{r.templates_total}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.last_inbound ? formatDistanceToNow(new Date(r.last_inbound), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.last_outbound ? formatDistanceToNow(new Date(r.last_outbound), { addSuffix: true }) : "—"}</TableCell>
                    <TableCell className="text-xs text-red-600 max-w-[180px] truncate" title={r.last_error ?? ""}>{r.last_error ?? "—"}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost"><Link to={`/ws/${r.workspace_slug}/settings`}><ExternalLink className="w-3.5 h-3.5" /></Link></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

const FilterSelect = ({
  value, onChange, options, placeholder,
}: { value: string; onChange: (v: string) => void; options: Array<[string, string]>; placeholder: string }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-44 h-10"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
  </Select>
);

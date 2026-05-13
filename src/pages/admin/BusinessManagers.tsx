import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Plus, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { fetchBmMetrics } from "@/lib/metrics";

type BM = {
  id: string;
  workspace_id: string;
  name: string;
  provider: string;
  external_id: string | null;
  owner_email: string | null;
  status: string;
  warmup_stage: string | null;
  warmup_started_at: string | null;
  daily_warmup_cap: number | null;
  current_day_sent: number;
  health_score: number;
  last_warmup_action_at: string | null;
  created_at: string;
  ads_launched_before: boolean;
  next_warmup_run_date: string | null;
};

type WS = { id: string; name: string };
type NumberRow = { id: string; business_manager_id: string | null; status: string };

const STATUSES = ["warming", "active", "paused", "restricted", "blocked", "retired"] as const;

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "active") return "default";
  if (s === "warming") return "secondary";
  if (s === "restricted" || s === "blocked") return "destructive";
  return "outline";
};

const fetchAll = async () => {
  const [{ data: bms, error }, { data: workspaces }, { data: numbers }] = await Promise.all([
    supabase.from("business_managers").select("*").order("created_at", { ascending: false }),
    supabase.from("workspaces").select("id, name").eq("is_active", true).order("name"),
    supabase.from("whatsapp_numbers").select("id, business_manager_id, status"),
  ]);
  if (error) throw error;
  return {
    bms: (bms ?? []) as BM[],
    workspaces: (workspaces ?? []) as WS[],
    numbers: (numbers ?? []) as NumberRow[],
  };
};

const BusinessManagers = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["business-managers"], queryFn: fetchAll });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [wsFilter, setWsFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", workspace_id: "", provider: "gupshup", external_id: "", owner_email: "" });

  const numbersByBm = useMemo(() => {
    const m = new Map<string, NumberRow[]>();
    (data?.numbers ?? []).forEach((n) => {
      if (!n.business_manager_id) return;
      if (!m.has(n.business_manager_id)) m.set(n.business_manager_id, []);
      m.get(n.business_manager_id)!.push(n);
    });
    return m;
  }, [data?.numbers]);

  const wsName = (id: string) => data?.workspaces.find((w) => w.id === id)?.name ?? "—";

  const rows = useMemo(() => {
    const list = data?.bms ?? [];
    return list.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (wsFilter !== "all" && b.workspace_id !== wsFilter) return false;
      if (q && !`${b.name} ${b.external_id ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data?.bms, statusFilter, wsFilter, q]);

  const bmIds = useMemo(() => (data?.bms ?? []).map(b => b.id), [data?.bms]);
  const { data: bmMetrics } = useQuery({
    queryKey: ["business-managers", "metrics", bmIds],
    enabled: bmIds.length > 0,
    queryFn: () => fetchBmMetrics(bmIds),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      if (!draft.name || !draft.workspace_id) throw new Error("Name and workspace required");
      const { error } = await supabase.from("business_managers").insert({
        name: draft.name.trim(),
        workspace_id: draft.workspace_id,
        provider: draft.provider,
        external_id: draft.external_id.trim() || null,
        owner_email: draft.owner_email.trim() || null,
        created_by: u.user.id,
        status: "warming",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Business Manager created");
      setCreateOpen(false);
      setDraft({ name: "", workspace_id: "", provider: "gupshup", external_id: "", owner_email: "" });
      qc.invalidateQueries({ queryKey: ["business-managers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Button>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-lg font-semibold">Business Managers</h1>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add BM
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name or external ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={wsFilter} onValueChange={setWsFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workspaces</SelectItem>
              {(data?.workspaces ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border bg-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Numbers</TableHead>
                  <TableHead>Sent today</TableHead>
                  <TableHead>Ads before?</TableHead>
                  <TableHead>Next warm-up</TableHead>
                  <TableHead>Last warmup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-12">No Business Managers yet</TableCell></TableRow>
                ) : rows.map((b) => {
                  const nums = numbersByBm.get(b.id) ?? [];
                  const active = nums.filter((n) => n.status === "active").length;
                  const restricted = nums.filter((n) => n.status === "restricted").length;
                  const blocked = nums.filter((n) => n.status === "banned" || n.status === "blocked").length;
                  const bm = bmMetrics?.get(b.id);
                  return (
                    <TableRow key={b.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/admin/business-managers/${b.id}`)}>
                      <TableCell className="font-medium">
                        <Link to={`/admin/business-managers/${b.id}`} className="hover:underline">{b.name}</Link>
                        {b.external_id && <div className="text-xs text-muted-foreground">{b.external_id}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{wsName(b.workspace_id)}</TableCell>
                      <TableCell><Badge variant={statusVariant(b.status)}>{b.status}</Badge></TableCell>
                      <TableCell className="text-sm">{b.warmup_stage ?? "—"}</TableCell>
                      <TableCell className="text-sm">{b.health_score}</TableCell>
                      <TableCell className="text-sm">
                        <span>{nums.length}</span>
                        <span className="text-muted-foreground"> · {active}a / {restricted}r / {blocked}b</span>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{(bm?.sent_today ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">
                        {b.ads_launched_before ? <Badge variant="default">Yes</Badge> : <span className="text-muted-foreground">No</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.next_warmup_run_date ? format(new Date(b.next_warmup_run_date), "MMM d") : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.last_warmup_action_at ? formatDistanceToNow(new Date(b.last_warmup_action_at), { addSuffix: true }) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Business Manager</DialogTitle>
            <DialogDescription>Register a BM to track warmup status and allocated numbers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="BM-Iskra-01" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Workspace</label>
              <Select value={draft.workspace_id} onValueChange={(v) => setDraft({ ...draft, workspace_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select workspace" /></SelectTrigger>
                <SelectContent>
                  {(data?.workspaces ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Provider</label>
                <Select value={draft.provider} onValueChange={(v) => setDraft({ ...draft, provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gupshup">Gupshup</SelectItem>
                    <SelectItem value="meta">Meta direct</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">External ID</label>
                <Input value={draft.external_id} onChange={(e) => setDraft({ ...draft, external_id: e.target.value })} placeholder="Meta BM ID" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Owner email</label>
              <Input value={draft.owner_email} onChange={(e) => setDraft({ ...draft, owner_email: e.target.value })} placeholder="ops@iskra.ae" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessManagers;

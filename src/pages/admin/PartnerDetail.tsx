import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Plus, FileText, Send, CheckCircle2, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfMonth } from "date-fns";

const LIFECYCLE_STATUSES = ["ready", "warming_up", "verifying", "disabled"] as const;
const VERIFICATION_STATUSES = ["unverified", "verifying", "verified"] as const;
type Lifecycle = typeof LIFECYCLE_STATUSES[number];
type Verification = typeof VERIFICATION_STATUSES[number];

// Map legacy statuses to new lifecycle buckets for display.
const lifecycleBucket = (s?: string | null): Lifecycle => {
  const v = String(s ?? "").toLowerCase();
  if (v === "ready" || v === "active") return "ready";
  if (v === "warming_up" || v === "warming") return "warming_up";
  if (v === "verifying") return "verifying";
  if (v === "disabled" || v === "inactive" || v === "paused") return "disabled";
  return "warming_up";
};

const lifecycleVariant = (l: Lifecycle): any =>
  l === "ready" ? "default" : l === "disabled" ? "destructive" : "secondary";

const verificationVariant = (v: string): any =>
  v === "verified" ? "default" : v === "verifying" ? "secondary" : "outline";

const fmtUsd = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const runStatusVariant = (s: string): any =>
  s === "paid" ? "default" : s === "approved" ? "secondary" : s === "void" ? "destructive" : "outline";

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: partner, isLoading: partnerLoading } = useQuery({
    queryKey: ["admin", "partner", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("partners").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: assignments } = useQuery({
    queryKey: ["admin", "partner-assigns", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bm_partner_assignments")
        .select("*")
        .eq("partner_id", id!)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const activeAssigns = useMemo(() => (assignments || []).filter(a => !a.effective_to), [assignments]);
  const bmIds = useMemo(() => Array.from(new Set(activeAssigns.map(a => a.business_manager_id))), [activeAssigns]);

  const { data: bms } = useQuery({
    queryKey: ["admin", "partner-bms", id, bmIds],
    queryFn: async () => {
      if (!bmIds.length) return [] as any[];
      const { data, error } = await supabase.from("business_managers").select("*").in("id", bmIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: bmIds.length > 0,
  });

  const { data: numbers } = useQuery({
    queryKey: ["admin", "partner-numbers", id, bmIds],
    queryFn: async () => {
      if (!bmIds.length) return [] as any[];
      const { data } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name, status, business_manager_id, workspace_id")
        .in("business_manager_id", bmIds);
      return data as any[] || [];
    },
    enabled: bmIds.length > 0,
  });

  const numberIds = useMemo(() => (numbers || []).map((n: any) => n.id), [numbers]);

  const { data: liveStats } = useQuery({
    queryKey: ["admin", "partner-num-live", numberIds],
    queryFn: async () => {
      if (!numberIds.length) return [] as any[];
      const { data, error } = await (supabase.rpc as any)("number_live_stats", { p_number_ids: numberIds });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: numberIds.length > 0,
    refetchInterval: 30_000,
  });

  const liveByNum = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of liveStats ?? []) m.set(r.whatsapp_number_id, r);
    return m;
  }, [liveStats]);

  const { data: workspaces } = useQuery({
    queryKey: ["admin", "all-workspaces-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("workspaces").select("id, name");
      return data as any[] || [];
    },
  });
  const wsName = (wsId: string | null) => workspaces?.find(w => w.id === wsId)?.name || "—";

  const { data: runs } = useQuery({
    queryKey: ["admin", "partner-runs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payout_runs")
        .select("*").eq("partner_id", id!).order("period_from", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  if (partnerLoading || !partner) return <div className="p-6"><Loader2 className="animate-spin w-5 h-5" /></div>;

  // ---- Aggregations across linked BMs / numbers ----
  const totalNums = numbers?.length || 0;
  const restrictedNums = (numbers || []).filter(n => n.status === "restricted").length;
  const blockedNums = (numbers || []).filter(n => n.status === "blocked" || n.status === "banned").length;

  const bmList = bms || [];
  const lifecycleCounts = bmList.reduce(
    (acc, b: any) => { acc[lifecycleBucket(b.status)]++; return acc; },
    { ready: 0, warming_up: 0, verifying: 0, disabled: 0 } as Record<Lifecycle, number>,
  );

  const sent7dTotal = (liveStats ?? []).reduce((s, r: any) => s + Number(r.sent_7d || 0), 0);
  const unpaid = (runs || []).filter(r => r.status === "draft" || r.status === "approved")
    .reduce((s, r) => s + Number(r.total_payout_usd || 0), 0);
  const monthStart = startOfMonth(new Date());
  const paidThisMonth = (runs || []).filter(r => r.status === "paid" && r.paid_at && new Date(r.paid_at) >= monthStart)
    .reduce((s, r) => s + Number(r.paid_amount_usd ?? r.total_payout_usd ?? 0), 0);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/admin/partners"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Partners</Button></Link>
          <h1 className="font-display text-2xl">{partner.name}</h1>
          <Badge variant={partner.status === "active" ? "default" : "secondary"}>{partner.status}</Badge>
          <Badge variant="outline">{partner.kind}</Badge>
          <Badge variant="outline">{partner.cadence}</Badge>
          <span className="text-sm text-muted-foreground ml-auto">
            Default rate: ${Number(partner.default_payout_rate_usd).toFixed(4)} {partner.currency}
          </span>
        </div>

        {/* TOP SUMMARY STRIP - live across linked BMs / numbers */}
        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
          <Stat label="Total BMs" value={String(bmList.length)} />
          <Stat label="Ready" value={String(lifecycleCounts.ready)} />
          <Stat label="Warming up" value={String(lifecycleCounts.warming_up)} />
          <Stat label="Verifying" value={String(lifecycleCounts.verifying)} />
          <Stat label="Disabled" value={String(lifecycleCounts.disabled)} />
          <Stat label="Restricted #" value={String(restrictedNums)} alert={restrictedNums > 0} />
          <Stat label="Blocked #" value={String(blockedNums)} alert={blockedNums > 0} />
          <Stat label="Sent 7d" value={sent7dTotal.toLocaleString()} />
          <Stat label="Open payout" value={fmtUsd(unpaid)} alert={unpaid > 0} />
          <Stat label="Paid this month" value={fmtUsd(paidThisMonth)} />
        </div>

        <Tabs defaultValue="bms">
          <TabsList>
            <TabsTrigger value="bms">Business Managers</TabsTrigger>
            <TabsTrigger value="numbers">Numbers</TabsTrigger>
            <TabsTrigger value="finance">Finance & Reports</TabsTrigger>
            <TabsTrigger value="payments">Payment History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* BUSINESS MANAGERS */}
          <TabsContent value="bms" className="pt-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-muted-foreground">
                {bmList.length} BM(s) linked - {totalNums} number(s) total
              </div>
              <div className="flex gap-2">
                <CreateBMDialog
                  partnerId={id!}
                  partnerDefaultRate={Number(partner.default_payout_rate_usd) || 0.005}
                  workspaces={workspaces || []}
                  onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "partner-assigns", id] })}
                />
                <LinkBMDialog
                  partnerId={id!}
                  onLinked={() => qc.invalidateQueries({ queryKey: ["admin", "partner-assigns", id] })}
                />
              </div>
            </div>

            <Card>
              <CardHeader><CardTitle>Linked Business Managers</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>BM</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead>Warm-up / Ads</TableHead>
                    <TableHead>Numbers</TableHead>
                    <TableHead>Numbers summary</TableHead>
                    <TableHead className="text-right">Sent today</TableHead>
                    <TableHead className="text-right">Sent 7d</TableHead>
                    <TableHead className="text-right">Sent all</TableHead>
                    <TableHead className="text-right">Restricted</TableHead>
                    <TableHead className="text-right">Blocked</TableHead>
                    <TableHead className="text-right">Clients</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {activeAssigns.map(a => {
                      const bm = bmList.find(b => b.id === a.business_manager_id);
                      const bmNums = (numbers || []).filter(n => n.business_manager_id === a.business_manager_id);
                      const restricted = bmNums.filter(n => n.status === "restricted").length;
                      const blocked = bmNums.filter(n => n.status === "blocked" || n.status === "banned").length;
                      const wsSet = new Set(bmNums.map(n => n.workspace_id).filter(Boolean));
                      const sentToday = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.sent_today || 0), 0);
                      const sent7d = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.sent_7d || 0), 0);
                      const sentAll = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.sent_all || 0), 0);
                      const lc = lifecycleBucket(bm?.status);
                      const summary = bmNums.slice(0, 3).map(n => n.display_name || `+${n.phone_number}`).join(", ")
                        + (bmNums.length > 3 ? ` +${bmNums.length - 3}` : "");
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {bm ? <Link to={`/admin/business-managers/${bm.id}`} className="hover:underline">{bm.name}</Link> : a.business_manager_id.slice(0,8)}
                            <div className="text-[10px] text-muted-foreground">{bm?.meta_bm_id || bm?.external_id || ""}</div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {bm?.created_at ? format(new Date(bm.created_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={verificationVariant(bm?.verification_status || "unverified")}>
                              {bm?.verification_status || "unverified"}
                            </Badge>
                          </TableCell>
                          <TableCell><Badge variant={lifecycleVariant(lc)}>{lc}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {bm?.ads_running ? <Badge>ads running</Badge> : null}
                            {lc === "warming_up" && (
                              <div className="text-muted-foreground mt-0.5">
                                {bm?.warmup_started_at ? `since ${format(new Date(bm.warmup_started_at), "MMM d")}` : "warm-up"}
                                {bm?.warmup_target_date ? ` → ${bm.warmup_target_date}` : ""}
                              </div>
                            )}
                            {!bm?.ads_running && lc !== "warming_up" && <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">{bmNums.length}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={summary}>{summary || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{sentToday.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{sent7d.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{sentAll.toLocaleString()}</TableCell>
                          <TableCell className={`text-right tabular-nums ${restricted > 0 ? "text-amber-600 font-medium" : ""}`}>{restricted}</TableCell>
                          <TableCell className={`text-right tabular-nums ${blocked > 0 ? "text-destructive font-medium" : ""}`}>{blocked}</TableCell>
                          <TableCell className="text-right tabular-nums">{wsSet.size}</TableCell>
                          <TableCell>
                            <UnlinkButton assignmentId={a.id} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "partner-assigns", id] })} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!activeAssigns.length && (
                      <TableRow><TableCell colSpan={14} className="text-center py-6 text-muted-foreground">No BMs linked yet - create one above</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* NUMBERS (read-only summary) */}
          <TabsContent value="numbers" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Linked numbers summary</CardTitle>
                <p className="text-xs text-muted-foreground">Aggregated from linked BMs. Manage individual numbers in the BM detail page.</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>BM</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Warming</TableHead>
                    <TableHead>Restricted</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(bms || []).map(b => {
                      const bmNums = (numbers || []).filter(n => n.business_manager_id === b.id);
                      const wsIdSet = Array.from(new Set(bmNums.map(n => n.workspace_id).filter(Boolean)));
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{wsIdSet.map(wsName).join(", ") || "—"}</TableCell>
                          <TableCell>{bmNums.length}</TableCell>
                          <TableCell>{bmNums.filter(n => n.status === "active").length}</TableCell>
                          <TableCell>{bmNums.filter(n => n.status === "warming").length}</TableCell>
                          <TableCell>{bmNums.filter(n => n.status === "restricted" || n.status === "blocked" || n.status === "banned").length}</TableCell>
                          <TableCell><Link to={`/admin/business-managers/${b.id}`}><Button variant="ghost" size="sm">Open BM</Button></Link></TableCell>
                        </TableRow>
                      );
                    })}
                    {!bms?.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No numbers</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FINANCE */}
          <TabsContent value="finance" className="pt-4 space-y-4">
            <GenerateRunCard partnerId={id!} partnerKind={partner.kind} onGen={() => qc.invalidateQueries({ queryKey: ["admin", "partner-runs", id] })} />
            <Card>
              <CardHeader><CardTitle>Payout runs</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(runs || []).map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.period_from} → {r.period_to}</TableCell>
                        <TableCell>{r.role ? <Badge variant="outline">{r.role}</Badge> : <span className="text-xs text-muted-foreground">legacy</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.cadence || "manual"}{r.auto_generated ? " · auto" : ""}</TableCell>
                        <TableCell><Badge variant={runStatusVariant(r.status)}>{r.status}</Badge></TableCell>
                        <TableCell>{r.totals_delivered}</TableCell>
                        <TableCell>{fmtUsd(Number(r.total_payout_usd))}</TableCell>
                        <TableCell className="flex gap-2">
                          <Link to={`/admin/finance/runs/${r.id}`}><Button size="sm" variant="ghost">Open</Button></Link>
                          <PdfButton runId={r.id} />
                          <SlackPostButton runId={r.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!runs?.length && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No runs yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PAYMENT HISTORY */}
          <TabsContent value="payments" className="pt-4">
            <Card>
              <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid at</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(runs || []).filter(r => ["approved","paid","void"].includes(r.status)).map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.period_from} → {r.period_to}</TableCell>
                        <TableCell>{r.role || "-"}</TableCell>
                        <TableCell>{fmtUsd(Number(r.paid_amount_usd ?? r.total_payout_usd))}</TableCell>
                        <TableCell><Badge variant={runStatusVariant(r.status)}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.paid_at ? format(new Date(r.paid_at), "yyyy-MM-dd HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="text-xs">{r.paid_reference || "—"}</TableCell>
                        <TableCell>
                          {r.status !== "paid" && r.status !== "void" && (
                            <MarkPaidButton runId={r.id} amount={Number(r.total_payout_usd)} onDone={() => qc.invalidateQueries({ queryKey: ["admin", "partner-runs", id] })} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!runs?.filter(r => ["approved","paid","void"].includes(r.status)).length && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nothing approved yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="pt-4">
            <SettingsCard partner={partner} onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "partner", id] })} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const Stat = ({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) => (
  <Card>
    <CardContent className="pt-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${alert ? "text-amber-600" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </CardContent>
  </Card>
);

function CreateBMDialog({
  partnerId, partnerDefaultRate, workspaces, onCreated,
}: {
  partnerId: string;
  partnerDefaultRate: number;
  workspaces: Array<{ id: string; name: string }>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [metaBmId, setMetaBmId] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("warming_up");
  const [verification, setVerification] = useState<Verification>("unverified");
  const [role, setRole] = useState("provider");
  const [rate, setRate] = useState(String(partnerDefaultRate));
  const [pickedNumberIds, setPickedNumberIds] = useState<string[]>([]);

  const { data: availableNumbers } = useQuery({
    queryKey: ["admin", "numbers-for-bm-create", workspaceId],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name, status, workspace_id, business_manager_id")
        .order("display_name", { ascending: true });
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  const reset = () => {
    setName(""); setWorkspaceId(""); setMetaBmId("");
    setLifecycle("warming_up"); setVerification("unverified");
    setRole("provider"); setRate(String(partnerDefaultRate));
    setPickedNumberIds([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("BM name required");
      if (!workspaceId) throw new Error("Pick a workspace");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      // 1) Create the BM
      const { data: bm, error: bmErr } = await supabase
        .from("business_managers")
        .insert({
          name: name.trim(),
          workspace_id: workspaceId,
          provider: "gupshup",
          meta_bm_id: metaBmId.trim() || null,
          status: lifecycle,
          verification_status: verification,
          warmup_started_at: lifecycle === "warming_up" ? new Date().toISOString() : null,
          created_by: u.user.id,
        } as any)
        .select("id")
        .single();
      if (bmErr) throw bmErr;

      // 2) Auto-link to current partner
      const { error: linkErr } = await supabase.from("bm_partner_assignments").insert({
        business_manager_id: bm.id,
        partner_id: partnerId,
        role,
        rate_usd: Number(rate),
        created_by: u.user.id,
      });
      if (linkErr) throw linkErr;

      // 3) Attach selected numbers to this BM
      if (pickedNumberIds.length > 0) {
        const { error: nErr } = await supabase
          .from("whatsapp_numbers")
          .update({ business_manager_id: bm.id } as any)
          .in("id", pickedNumberIds);
        if (nErr) throw nErr;
      }
    },
    onSuccess: () => {
      toast.success("Business Manager created and linked");
      setOpen(false); reset();
      onCreated();
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleNum = (nid: string) =>
    setPickedNumberIds(prev => prev.includes(nid) ? prev.filter(x => x !== nid) : [...prev, nid]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" />Create BM</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle><Building2 className="w-4 h-4 inline mr-2" />New Business Manager</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">BM name *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ISKRA-BM-04" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Meta BM ID</label>
              <Input value={metaBmId} onChange={e => setMetaBmId(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Workspace *</label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger><SelectValue placeholder="Pick workspace" /></SelectTrigger>
                <SelectContent>
                  {workspaces.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Lifecycle status</label>
              <Select value={lifecycle} onValueChange={(v) => setLifecycle(v as Lifecycle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Verification status</label>
              <Select value={verification} onValueChange={(v) => setVerification(v as Verification)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VERIFICATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Partner role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rate $/delivered</label>
              <Input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              Linked numbers ({pickedNumberIds.length} selected)
              {!workspaceId && " - pick a workspace first"}
            </label>
            <div className="mt-1 max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-1">
              {(availableNumbers ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground py-2 text-center">
                  {workspaceId ? "No numbers in this workspace" : "Pick a workspace to see numbers"}
                </div>
              )}
              {(availableNumbers ?? []).map(n => (
                <label key={n.id} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-1 py-0.5 cursor-pointer">
                  <Checkbox
                    checked={pickedNumberIds.includes(n.id)}
                    onCheckedChange={() => toggleNum(n.id)}
                  />
                  <span className="font-mono text-xs">+{n.phone_number}</span>
                  <span className="text-muted-foreground">{n.display_name || ""}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{n.status}</Badge>
                  {n.business_manager_id && <span className="text-[10px] text-amber-600">(reassign)</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim() || !workspaceId}>
            {create.isPending ? "Creating…" : "Create & link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkBMDialog({ partnerId, onLinked }: { partnerId: string; onLinked: () => void }) {
  const [open, setOpen] = useState(false);
  const [bmId, setBmId] = useState("");
  const [role, setRole] = useState("provider");
  const [rate, setRate] = useState("0.005");

  const { data: allBms } = useQuery({
    queryKey: ["admin", "all-bms-for-link"],
    queryFn: async () => {
      const { data } = await supabase.from("business_managers").select("id, name, status").order("name");
      return data as any[] || [];
    },
    enabled: open,
  });

  const link = useMutation({
    mutationFn: async () => {
      if (!bmId) throw new Error("Pick a BM");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("bm_partner_assignments").insert({
        business_manager_id: bmId, partner_id: partnerId, role, rate_usd: Number(rate),
        created_by: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("BM linked"); setOpen(false); setBmId(""); onLinked(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Link existing BM</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Link existing Business Manager</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">BM</label>
            <Select value={bmId} onValueChange={setBmId}>
              <SelectTrigger><SelectValue placeholder="Pick BM" /></SelectTrigger>
              <SelectContent>
                {(allBms || []).map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.status})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="referral">Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rate $/delivered</label>
              <Input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => link.mutate()} disabled={link.isPending || !bmId}>
            {link.isPending ? "Linking…" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnlinkButton({ assignmentId, onDone }: { assignmentId: string; onDone: () => void }) {
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("bm_partner_assignments")
        .update({ effective_to: new Date().toISOString() })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Unlinked"); onDone(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}><Trash2 className="w-4 h-4" /></Button>;
}

function GenerateRunCard({ partnerId, partnerKind, onGen }: { partnerId: string; partnerKind: string; onGen: () => void }) {
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [role, setRole] = useState<string>(partnerKind === "referral" ? "referral" : "provider");

  const gen = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_payout_run_role" as any, {
        _partner_id: partnerId, _role: role, _from: from, _to: to, _cadence: "manual", _auto: false,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (runId) => {
      toast.success("Draft run generated");
      onGen();
      window.location.assign(`/admin/finance/runs/${runId}`);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Generate draft run</CardTitle></CardHeader>
      <CardContent>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">Provider</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Aggregates delivered events on linked BMs for this partner+role using the BM-assignment rates active at each event.
        </p>
      </CardContent>
    </Card>
  );
}

function PdfButton({ runId }: { runId: string }) {
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("payout-report-pdf", { body: { run_id: runId } });
      if (error) throw error;
      return data as { pdf_url?: string };
    },
    onSuccess: (d) => {
      if (d.pdf_url) window.open(d.pdf_url, "_blank");
      else toast.success("PDF generated");
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}><FileText className="w-4 h-4" /></Button>;
}

function SlackPostButton({ runId }: { runId: string }) {
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-payout-post", { body: { run_id: runId } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success("Posted to Slack"),
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}><Send className="w-4 h-4" /></Button>;
}

function MarkPaidButton({ runId, amount, onDone }: { runId: string; amount: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(String(amount));
  const [ref, setRef] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_payout_run_paid" as any, {
        _run_id: runId, _amount_usd: Number(amt), _reference: ref,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked paid"); setOpen(false); onDone(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><CheckCircle2 className="w-4 h-4 mr-1" />Mark paid</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark run paid</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Amount paid (USD)</label>
              <Input type="number" step="0.01" value={amt} onChange={e => setAmt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reference</label>
              <Input value={ref} onChange={e => setRef(e.target.value)} placeholder="Wise tx, IBAN ref…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Saving…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SettingsCard({ partner, onSaved }: { partner: any; onSaved: () => void }) {
  const [kind, setKind] = useState(partner.kind);
  const [cadence, setCadence] = useState(partner.cadence);
  const [autoSlack, setAutoSlack] = useState(partner.auto_post_slack);
  const [defRate, setDefRate] = useState(String(partner.default_payout_rate_usd));
  const [email, setEmail] = useState(partner.contact_email || "");
  const [notes, setNotes] = useState(partner.payment_notes || "");
  const [status, setStatus] = useState(partner.status);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("partners").update({
        kind, cadence, auto_post_slack: autoSlack,
        default_payout_rate_usd: Number(defRate),
        contact_email: email || null,
        payment_notes: notes || null,
        status,
      } as any).eq("id", partner.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Kind</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="provider">Provider</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cadence</label>
            <Select value={cadence} onValueChange={setCadence}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Default rate</label>
            <Input type="number" step="0.0001" value={defRate} onChange={e => setDefRate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Contact email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Payment notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoSlack} onChange={e => setAutoSlack(e.target.checked)} />
            Auto-post generated reports to internal Slack
          </label>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </CardContent>
    </Card>
  );
}

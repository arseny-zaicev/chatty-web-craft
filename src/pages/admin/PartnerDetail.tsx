import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { visibleRefetchInterval } from "@/lib/visibleRefetchInterval";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ArrowLeft, Plus, FileText, Send, CheckCircle2, Trash2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfMonth } from "date-fns";
import { fetchPartnerMetrics, fetchNumberRates } from "@/lib/metrics";
import { NumberOwnershipPanel } from "@/components/admin/NumberOwnershipPanel";
import { PartnerEarningsPanel } from "@/components/admin/PartnerEarningsPanel";
import { InlineRateEditor, InlineTextEditor } from "@/components/admin/InlineRateEditor";

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
    refetchInterval: visibleRefetchInterval(30_000),
    refetchIntervalInBackground: false,
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

  const { data: partnerMetrics } = useQuery({
    queryKey: ["admin", "partner", id, "metrics"],
    enabled: !!id,
    queryFn: () => fetchPartnerMetrics([id!]),
    refetchInterval: visibleRefetchInterval(30_000),
    refetchIntervalInBackground: false,
  });
  const pm = id ? partnerMetrics?.get(id) : undefined;

  // Per-number active rates for this partner (used in BM table to compute Earned columns)
  const { data: numberRates } = useQuery({
    queryKey: ["admin", "partner-num-rates", id],
    enabled: !!id,
    queryFn: () => fetchNumberRates(id!),
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
  const delivered7dTotal = (liveStats ?? []).reduce((s, r: any) => s + Number(r.delivered_7d || 0), 0);
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
          <Badge variant="outline">{partner.cadence}</Badge>
          {partner.referrer_partner_id && <ReferrerBadge id={partner.referrer_partner_id} /> }
          <span className="text-sm text-muted-foreground ml-auto">
            Partner rate: ${Number(partner.default_payout_rate_usd || 0).toFixed(4)} {partner.currency}
          </span>
        </div>

        {/* TOP SUMMARY STRIP - trimmed: only what you act on */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Stat label="BMs" value={`${lifecycleCounts.ready}/${bmList.length}`} hint={`${lifecycleCounts.disabled} disabled`} />
          <Stat label="Numbers" value={String(totalNums)} hint={`${restrictedNums} restricted · ${blockedNums} blocked`} alert={restrictedNums + blockedNums > 0} />
          <Stat label="Sent today" value={(pm?.sent_today ?? 0).toLocaleString()} />
          <Stat label="Delivered today" value={(pm?.delivered_today ?? 0).toLocaleString()} />
          <Stat label="Errors today" value={(pm?.failed_today ?? 0).toLocaleString()} alert={(pm?.failed_today ?? 0) > 0} />
          <Stat label="Sent 7d" value={sent7dTotal.toLocaleString()} />
          <Stat label="Delivered 7d" value={delivered7dTotal.toLocaleString()} />
          <Stat label="Sent all-time" value={(pm?.sent_alltime ?? 0).toLocaleString()} />
          <Stat label="Delivered all-time" value={(pm?.delivered_alltime ?? 0).toLocaleString()} />
          <Stat label="Earned today" value={fmtUsd(pm?.earned_today ?? 0)} accent />
          <Stat label="Earned 7d" value={fmtUsd(pm?.earned_7d ?? 0)} accent />
          <Stat label="Earned all-time" value={fmtUsd(pm?.earned_alltime ?? 0)} accent />
          <Stat label="Open payout" value={fmtUsd(unpaid)} alert={unpaid > 0} />
          <Stat label="Paid this month" value={fmtUsd(paidThisMonth)} />
        </div>

        <Tabs defaultValue="ownership">
          <TabsList>
            <TabsTrigger value="ownership">Numbers (truth)</TabsTrigger>
            <TabsTrigger value="earnings">Earnings (live)</TabsTrigger>
            <TabsTrigger value="bms">Business Managers</TabsTrigger>
            <TabsTrigger value="finance">Finance & Reports</TabsTrigger>
            <TabsTrigger value="payments">Payment History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="ownership" className="pt-4">
            <NumberOwnershipPanel
              partnerId={id!}
              partnerDefaultRate={Number(partner.default_payout_rate_usd) || 0.005}
            />
          </TabsContent>

          <TabsContent value="earnings" className="pt-4">
            <PartnerEarningsPanel partnerId={id!} />
          </TabsContent>


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
                    <TableHead>BM rate</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Warm-up</TableHead>
                    <TableHead>Numbers</TableHead>
                    <TableHead>Numbers summary</TableHead>
                    <TableHead className="text-right">Deliv / Sent today</TableHead>
                    <TableHead className="text-right">Deliv / Sent 7d</TableHead>
                    <TableHead className="text-right">Deliv / Sent all</TableHead>
                    <TableHead className="text-right">Earned today</TableHead>
                    <TableHead className="text-right">Earned 7d</TableHead>
                    <TableHead className="text-right">Earned all</TableHead>
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
                      const delivToday = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.delivered_today || 0), 0);
                      const deliv7d = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.delivered_7d || 0), 0);
                      const delivAll = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.delivered_all || 0), 0);
                      const earnedToday = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.delivered_today || 0) * (numberRates?.get(n.id) ?? 0), 0);
                      const earned7d = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.delivered_7d || 0) * (numberRates?.get(n.id) ?? 0), 0);
                      const earnedAll = bmNums.reduce((s, n) => s + Number(liveByNum.get(n.id)?.delivered_all || 0) * (numberRates?.get(n.id) ?? 0), 0);
                      const summary = bmNums.slice(0, 3).map(n => n.display_name || `+${n.phone_number}`).join(", ")
                        + (bmNums.length > 3 ? ` +${bmNums.length - 3}` : "");
                      const invalidateBm = () => {
                        qc.invalidateQueries({ queryKey: ["admin", "partner-bms", id, bmIds] });
                        qc.invalidateQueries({ queryKey: ["admin", "partner-numbers", id, bmIds] });
                        qc.invalidateQueries({ queryKey: ["business-managers"] });
                      };
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {bm ? (
                              <InlineTextEditor
                                value={bm.name}
                                onSave={async (next) => {
                                  if (!next.trim()) { toast.error("Name required"); return; }
                                  const { error } = await supabase
                                    .from("business_managers")
                                    .update({ name: next.trim(), updated_at: new Date().toISOString() } as any)
                                    .eq("id", bm.id);
                                  if (error) { toast.error(error.message); return; }
                                  toast.success("BM renamed");
                                  invalidateBm();
                                }}
                              />
                            ) : (
                              <span>{a.business_manager_id.slice(0,8)}</span>
                            )}
                            <div className="text-[10px] text-muted-foreground">
                              {bm ? (
                                <InlineTextEditor
                                  value={bm.meta_bm_id || ""}
                                  placeholder="Meta BM ID"
                                  onSave={async (next) => {
                                    const { error } = await supabase
                                      .from("business_managers")
                                      .update({ meta_bm_id: next || null, updated_at: new Date().toISOString() } as any)
                                      .eq("id", bm.id);
                                    if (error) { toast.error(error.message); return; }
                                    toast.success("Meta BM ID updated");
                                    invalidateBm();
                                  }}
                                />
                              ) : (bm?.external_id || "")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <InlineRateEditor
                              value={Number(a.rate_usd)}
                              onSave={async (next) => {
                                // History-preserving: close current, insert new
                                const { data: u } = await supabase.auth.getUser();
                                const nowIso = new Date().toISOString();
                                const { error: closeErr } = await supabase
                                  .from("bm_partner_assignments")
                                  .update({ effective_to: nowIso })
                                  .eq("id", a.id);
                                if (closeErr) { toast.error(closeErr.message); return; }
                                const { error: insErr } = await supabase
                                  .from("bm_partner_assignments")
                                  .insert({
                                    business_manager_id: a.business_manager_id,
                                    partner_id: id!,
                                    role: a.role,
                                    rate_usd: next,
                                    created_by: u.user?.id,
                                    effective_from: nowIso,
                                  });
                                if (insErr) { toast.error(insErr.message); return; }
                                toast.success("BM rate updated (history preserved)");
                                qc.invalidateQueries({ queryKey: ["admin", "partner-assigns", id] });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {bm?.created_at ? format(new Date(bm.created_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            {bm ? <BmStatusSelect bm={bm} onChanged={invalidateBm} /> : <Badge variant="outline">—</Badge>}
                          </TableCell>
                          <TableCell>
                            {bm ? <BmWarmupCell bm={bm} onChanged={invalidateBm} /> : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {bm ? (
                              <AddNumbersToBmButton
                                bmId={bm.id}
                                bmWorkspaceId={bm.workspace_id}
                                count={bmNums.length}
                                onAdded={invalidateBm}
                              />
                            ) : bmNums.length}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={summary}>{summary || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{delivToday.toLocaleString()}</span>
                            <span className="text-muted-foreground"> / {sentToday.toLocaleString()}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{deliv7d.toLocaleString()}</span>
                            <span className="text-muted-foreground"> / {sent7d.toLocaleString()}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{delivAll.toLocaleString()}</span>
                            <span className="text-muted-foreground"> / {sentAll.toLocaleString()}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">{fmtUsd(earnedToday)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">{fmtUsd(earned7d)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">{fmtUsd(earnedAll)}</TableCell>
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

          {/* FINANCE */}
          <TabsContent value="finance" className="pt-4 space-y-4">
            <ManagerReportCard managerId={id!} />
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
                        <TableCell className="flex gap-1">
                          <Link to={`/admin/finance/runs/${r.id}`}><Button size="sm" variant="ghost">Open</Button></Link>
                          <PdfButton runId={r.id} />
                          <SlackPostButton runId={r.id} />
                          <DeleteRunButton
                            runId={r.id}
                            status={r.status}
                            paths={[r.pdf_storage_path, r.csv_storage_path, r.partner_pdf_storage_path]}
                            onDeleted={() => qc.invalidateQueries({ queryKey: ["admin", "partner-runs", id] })}
                          />
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

const Stat = ({ label, value, hint, alert, accent }: { label: string; value: string; hint?: string; alert?: boolean; accent?: boolean }) => (
  <Card>
    <CardContent className="pt-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${alert ? "text-amber-600" : accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </CardContent>
  </Card>
);

function ReferrerBadge({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["partner-name", id],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("name").eq("id", id).maybeSingle();
      return data?.name as string | undefined;
    },
  });
  if (!data) return null;
  return <Badge variant="outline">Manager: {data}</Badge>;
}

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
  const [metaBmId, setMetaBmId] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("warming_up");
  const [role, setRole] = useState("provider");
  const [rate, setRate] = useState(String(partnerDefaultRate));
  const [pickedNumberIds, setPickedNumberIds] = useState<string[]>([]);

  const { data: availableNumbers } = useQuery({
    queryKey: ["admin", "numbers-for-bm-create"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name, status, workspace_id, business_manager_id")
        .order("display_name", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  const wsName = (wsId: string | null) =>
    workspaces.find(w => w.id === wsId)?.name || "—";

  const reset = () => {
    setName(""); setMetaBmId("");
    setLifecycle("warming_up");
    setRole("provider"); setRate(String(partnerDefaultRate));
    setPickedNumberIds([]);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("BM name required");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      // 1) Create the BM (workspace inferred from linked numbers, if any)
      const inferredWorkspaceId = pickedNumberIds.length
        ? (availableNumbers ?? []).find(n => pickedNumberIds.includes(n.id))?.workspace_id ?? null
        : null;

      const { data: bm, error: bmErr } = await supabase
        .from("business_managers")
        .insert({
          name: name.trim(),
          workspace_id: inferredWorkspaceId,
          provider: "gupshup",
          meta_bm_id: metaBmId.trim() || null,
          status: lifecycle,
          verification_status: "unverified",
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
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={lifecycle} onValueChange={(v) => setLifecycle(v as Lifecycle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
            </label>
            <div className="mt-1 max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-1">
              {(availableNumbers ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground py-2 text-center">No numbers available</div>
              )}
              {(availableNumbers ?? []).map(n => (
                <label key={n.id} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-1 py-0.5 cursor-pointer">
                  <Checkbox
                    checked={pickedNumberIds.includes(n.id)}
                    onCheckedChange={() => toggleNum(n.id)}
                  />
                  <span className="font-mono text-xs">+{n.phone_number}</span>
                  <span className="text-muted-foreground">{n.display_name || ""}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{wsName(n.workspace_id)}</Badge>
                  <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
                  {n.business_manager_id && <span className="text-[10px] text-amber-600">(reassign)</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
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
          <div>
            <label className="text-xs text-muted-foreground">Rate $/delivered</label>
            <Input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} />
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

function ManagerReportCard({ managerId }: { managerId: string }) {
  const { data: downlines } = useQuery({
    queryKey: ["admin", "partner-downlines", managerId],
    queryFn: async () => {
      const { data } = await supabase.from("partners")
        .select("id, name, referral_rate_usd").eq("referrer_partner_id", managerId);
      return (data || []) as any[];
    },
  });
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const gen = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manager-payout-report-pdf", {
        body: { manager_id: managerId, period_from: from, period_to: to },
      });
      if (error) throw error;
      return data as { pdf_url?: string };
    },
    onSuccess: (d) => { if (d?.pdf_url) window.open(d.pdf_url, "_blank"); toast.success("Manager PDF generated"); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (!downlines?.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Manager PDF (consolidated)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          This partner is the manager of {downlines.length} downline partner(s). Generate one consolidated payout PDF covering their own numbers + every attached partner for the chosen period.
        </p>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">To (inclusive)</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
            <FileText className="w-4 h-4 mr-1" />{gen.isPending ? "Generating…" : "Generate manager PDF"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
  const [cadence, setCadence] = useState(partner.cadence);
  const [autoSlack, setAutoSlack] = useState(partner.auto_post_slack);
  const [defRate, setDefRate] = useState(String(partner.default_payout_rate_usd));
  const [email, setEmail] = useState(partner.contact_email || "");
  const [notes, setNotes] = useState(partner.payment_notes || "");
  const [status, setStatus] = useState(partner.status);
  const [referrerId, setReferrerId] = useState<string>(partner.referrer_partner_id || "none");
  const [referralRate, setReferralRate] = useState(String(partner.referral_rate_usd ?? 0));

  const { data: otherPartners } = useQuery({
    queryKey: ["admin", "all-partners-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("partners").select("id, name").order("name");
      return (data || []).filter((p: any) => p.id !== partner.id) as any[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("partners").update({
        cadence, auto_post_slack: autoSlack,
        default_payout_rate_usd: Number(defRate),
        contact_email: email || null,
        payment_notes: notes || null,
        status,
        referrer_partner_id: referrerId === "none" ? null : referrerId,
        referral_rate_usd: Number(referralRate) || 0,
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
            <label className="text-xs text-muted-foreground">Partner rate ($/delivered)</label>
            <Input type="number" step="0.0001" value={defRate} onChange={e => setDefRate(e.target.value)} />
          </div>
          <div></div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <div className="text-sm font-medium mb-2">Manager (upline)</div>
            <p className="text-xs text-muted-foreground mb-3">
              If this partner reports to someone (a manager), pick the manager and set the rate <b>we pay the manager</b> per delivered message of this partner. The manager will see this in their consolidated PDF.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Manager</label>
            <Select value={referrerId} onValueChange={setReferrerId}>
              <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No manager</SelectItem>
                {(otherPartners || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Manager rate ($/delivered)</label>
            <Input type="number" step="0.0001" value={referralRate} onChange={e => setReferralRate(e.target.value)} />
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-1">
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


function VerificationSelect({
  bmId, value, onChanged,
}: { bmId: string; value: Verification; onChanged: () => void }) {
  const m = useMutation({
    mutationFn: async (next: Verification) => {
      const { error } = await supabase
        .from("business_managers")
        .update({ verification_status: next, updated_at: new Date().toISOString() } as any)
        .eq("id", bmId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Verification updated"); onChanged(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Select value={value} onValueChange={(v) => m.mutate(v as Verification)}>
      <SelectTrigger className="h-7 w-[120px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VERIFICATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DeleteRunButton({
  runId, status, paths, onDeleted,
}: { runId: string; status: string; paths: Array<string | null | undefined>; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const allowed = status === "draft" || status === "void";

  const m = useMutation({
    mutationFn: async () => {
      // Best-effort storage cleanup first
      const cleanPaths = paths.filter((p): p is string => !!p);
      if (cleanPaths.length) {
        await supabase.storage.from("payout-reports").remove(cleanPaths).catch(() => {});
      }
      const { error } = await supabase.from("payout_runs").delete().eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Run deleted"); setOpen(false); onDeleted(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!allowed) {
    return (
      <Button size="sm" variant="ghost" disabled title="Void this run before it can be deleted">
        <Trash2 className="w-4 h-4 opacity-30" />
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)} title="Delete run">
        <Trash2 className="w-4 h-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete payout run?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            The run, all its line items and audit entries, and any generated PDF / CSV files will be removed permanently. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending}>
              {m.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===================== Inline BM editors (Partner detail) =====================

const BM_STATUS_OPTIONS = ["ready", "warming_up", "verifying", "disabled", "active", "paused"] as const;

function BmStatusSelect({ bm, onChanged }: { bm: any; onChanged: () => void }) {
  const value = String(bm.status ?? "warming_up");
  const m = useMutation({
    mutationFn: async (next: string) => {
      const patch: Record<string, unknown> = {
        status: next,
        last_warmup_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if ((next === "warming_up" || next === "warming") && !bm.warmup_started_at) {
        patch.warmup_started_at = new Date().toISOString();
      }
      const { error } = await supabase.from("business_managers").update(patch as any).eq("id", bm.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); onChanged(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Select value={value} onValueChange={(v) => m.mutate(v)}>
      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {BM_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const WARMUP_STAGE_PRESETS = ["Day 1-3", "Day 4-7", "Week 2", "Week 3", "Ready"];

function BmWarmupCell({ bm, onChanged }: { bm: any; onChanged: () => void }) {
  const stage = bm.warmup_stage ?? "";
  const nextDate = bm.next_warmup_run_date ?? "";
  const m = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("business_managers")
        .update({ ...patch, updated_at: new Date().toISOString() } as any).eq("id", bm.id);
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <Select
        value={WARMUP_STAGE_PRESETS.includes(stage) ? stage : (stage ? "__custom__" : "")}
        onValueChange={(v) => v !== "__custom__" && m.mutate({ warmup_stage: v || null })}
      >
        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Stage" /></SelectTrigger>
        <SelectContent>
          {WARMUP_STAGE_PRESETS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          {stage && !WARMUP_STAGE_PRESETS.includes(stage) && <SelectItem value="__custom__">{stage}</SelectItem>}
        </SelectContent>
      </Select>
      <Input
        type="date"
        className="h-7 text-xs"
        defaultValue={nextDate}
        onBlur={(e) => {
          const v = e.target.value || null;
          if (v !== (nextDate || null)) m.mutate({ next_warmup_run_date: v });
        }}
      />
    </div>
  );
}

function AddNumbersToBmButton({
  bmId, bmWorkspaceId, count, onAdded,
}: { bmId: string; bmWorkspaceId: string | null; count: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [showBusy, setShowBusy] = useState(false);
  const [search, setSearch] = useState("");

  const { data: pool } = useQuery({
    queryKey: ["admin", "bm-attach-pool", bmId, showBusy],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_numbers")
        .select("id, phone_number, display_name, status, workspace_id, business_manager_id")
        .neq("id", "00000000-0000-0000-0000-000000000000")
        .neq("business_manager_id", bmId);
      if (!showBusy) q = q.is("business_manager_id", null);
      const { data, error } = await q.order("display_name").limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: wsNames } = useQuery({
    queryKey: ["admin", "ws-names-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("workspaces").select("id, name");
      const m = new Map<string, string>();
      (data ?? []).forEach((w: any) => m.set(w.id, w.name));
      return m;
    },
  });

  const { data: bmNames } = useQuery({
    queryKey: ["admin", "bm-names-mini"],
    enabled: showBusy && open,
    queryFn: async () => {
      const { data } = await supabase.from("business_managers").select("id, name");
      const m = new Map<string, string>();
      (data ?? []).forEach((b: any) => m.set(b.id, b.name));
      return m;
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pool ?? [];
    return (pool ?? []).filter(n =>
      String(n.phone_number || "").toLowerCase().includes(term) ||
      String(n.display_name || "").toLowerCase().includes(term)
    );
  }, [pool, search]);

  const attach = useMutation({
    mutationFn: async () => {
      if (!picked.length) return;
      const patch: Record<string, unknown> = { business_manager_id: bmId };
      if (bmWorkspaceId) patch.workspace_id = bmWorkspaceId;
      const { error } = await supabase.from("whatsapp_numbers").update(patch as any).in("id", picked);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${picked.length} number(s) attached`);
      setPicked([]); setOpen(false); onAdded();
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
          {count} <Plus className="w-3 h-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-2" align="end">
        <div className="flex items-center justify-between mb-2 gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search phone or name…"
            className="h-7 text-xs"
          />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 cursor-pointer">
          <Checkbox checked={showBusy} onCheckedChange={(v) => setShowBusy(Boolean(v))} />
          Show numbers attached to other BMs (will be re-attached on save)
        </label>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground py-3 text-center">No numbers match</div>
          )}
          {filtered.map(n => {
            const wsLabel = n.workspace_id ? (wsNames?.get(n.workspace_id) || n.workspace_id.slice(0,6)) : "no ws";
            const inOtherBm = n.business_manager_id && n.business_manager_id !== bmId;
            const otherBmLabel = inOtherBm ? (bmNames?.get(n.business_manager_id) || n.business_manager_id.slice(0,6)) : null;
            return (
              <label key={n.id} className="flex items-center gap-2 text-xs hover:bg-muted/50 rounded px-1 py-1 cursor-pointer">
                <Checkbox
                  checked={picked.includes(n.id)}
                  onCheckedChange={() => setPicked(p => p.includes(n.id) ? p.filter(x => x !== n.id) : [...p, n.id])}
                />
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">+{n.phone_number}</span>
                    <span className="text-muted-foreground truncate">{n.display_name || ""}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">ws: {wsLabel}</span>
                    {otherBmLabel && (
                      <span className="text-[10px] text-amber-600">· now in BM: {otherBmLabel}</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{n.status}</Badge>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => attach.mutate()} disabled={!picked.length || attach.isPending}>
            {attach.isPending ? "Attaching…" : `Attach (${picked.length})`}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

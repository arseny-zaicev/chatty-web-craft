import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, RefreshCw, ShieldCheck, CheckCircle2, FileText, Download, AlertTriangle, Ban, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";

const fmtUsd = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Per-delivered rates need 4 decimals, otherwise 0.005 rounds to $0.01.
const fmtRate = (n: number) => `$${Number(n || 0).toFixed(4)}`;

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
  s === "paid" ? "default" : s === "approved" ? "secondary" : s === "void" ? "destructive" : "outline";

export default function FinanceRunDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: run, isLoading } = useQuery({
    queryKey: ["finance", "run", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payout_runs").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: items } = useQuery({
    queryKey: ["finance", "run-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("payout_line_items")
        .select("*").eq("payout_run_id", id!).order("day").order("whatsapp_number_id");
      const numIds = Array.from(new Set((data || []).map((i: any) => i.whatsapp_number_id).filter(Boolean)));
      const wsIds = Array.from(new Set((data || []).map((i: any) => i.workspace_id).filter(Boolean)));
      const [{ data: nums }, { data: wss }] = await Promise.all([
        numIds.length ? supabase.from("whatsapp_numbers").select("id, phone_number, display_name, label").in("id", numIds) : { data: [] },
        wsIds.length ? supabase.from("workspaces").select("id, name").in("id", wsIds) : { data: [] },
      ]);
      const nm = new Map((nums || []).map((n: any) => [n.id, n]));
      const wm = new Map((wss || []).map((w: any) => [w.id, w]));
      return (data || []).map((i: any) => ({
        ...i,
        number_label: nm.get(i.whatsapp_number_id)?.display_name || nm.get(i.whatsapp_number_id)?.phone_number || "-",
        client_label: wm.get(i.workspace_id)?.name || "-",
      }));
    },
    enabled: !!id,
  });

  const { data: audit } = useQuery({
    queryKey: ["finance", "run-audit", id],
    queryFn: async () => {
      const { data } = await supabase.from("payout_run_audit")
        .select("*").eq("payout_run_id", id!).order("at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const recompute = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("recompute_payout_run" as any, { _run_id: id! });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recomputed"); qc.invalidateQueries({ queryKey: ["finance"] }); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_payout_run" as any, { _run_id: id! });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (r: any) => {
      if (!r) return;
      if (r.drift) {
        toast.error(`Drift detected: stored ${r.stored_delivered}/${fmtUsd(Number(r.stored_payout))} vs live ${r.live_delivered}/${fmtUsd(Number(r.live_payout))}`);
      } else {
        toast.success(`Verified · ${r.live_delivered} delivered · ${fmtUsd(Number(r.live_payout))} matches stored totals`);
      }
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("approve_payout_run" as any, { _run_id: id! });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Approved"); qc.invalidateQueries({ queryKey: ["finance"] }); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [paidOpen, setPaidOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidRef, setPaidRef] = useState("");
  const markPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_payout_run_paid" as any, {
        _run_id: id!, _amount_usd: Number(paidAmount), _reference: paidRef,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked paid"); setPaidOpen(false); qc.invalidateQueries({ queryKey: ["finance"] }); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const voidRun = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("void_payout_run" as any, { _run_id: id!, _reason: voidReason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Voided"); setVoidOpen(false); qc.invalidateQueries({ queryKey: ["finance"] }); },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const generatePdf = useMutation({
    mutationFn: async (mode: "internal" | "partner") => {
      const { data, error } = await supabase.functions.invoke("payout-report-pdf", { body: { run_id: id!, mode } });
      if (error) throw error;
      return data as { pdf_url: string; csv_url?: string; mode: string };
    },
    onSuccess: (r) => {
      toast.success(`${r.mode === "partner" ? "Partner" : "Internal"} PDF generated`);
      if (r?.pdf_url) window.open(r.pdf_url, "_blank");
      qc.invalidateQueries({ queryKey: ["finance", "run", id] });
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteRun = useMutation({
    mutationFn: async () => {
      const cleanPaths = [run?.pdf_storage_path, run?.csv_storage_path, run?.partner_pdf_storage_path]
        .filter((p): p is string => !!p);
      if (cleanPaths.length) {
        await supabase.storage.from("payout-reports").remove(cleanPaths).catch(() => {});
      }
      const { error } = await supabase.from("payout_runs").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Run deleted");
      qc.invalidateQueries({ queryKey: ["finance"] });
      navigate(`/admin/finance/partners/${run?.partner_id}`);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const downloadFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("payout-reports").createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) { toast.error("Could not get download URL"); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (isLoading || !run) return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const isDraft = run.status === "draft";
  const isFrozen = run.status === "approved" || run.status === "paid";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to={`/admin/finance/partners/${run.partner_id}`}><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Partner</Button></Link>
          <h1 className="font-display text-2xl">Payout run</h1>
          <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
          <span className="text-sm text-muted-foreground">{run.period_from} → {run.period_to}</span>
        </div>

        {/* Summary strip */}
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground mb-1">
              Period {run.period_from} → {run.period_to} · Status <span className="uppercase font-medium text-foreground">{run.status}</span>
            </div>
            <div className="text-base">
              <span className="font-medium">{Number(run.totals_delivered).toLocaleString()}</span>
              <span className="text-muted-foreground"> delivered</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-medium">Partner payout due</span>{" "}
              <span className="font-semibold text-foreground">{fmtUsd(Number(run.total_payout_usd))}</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI bar - internal admin numbers */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            ["Delivered", String(run.totals_delivered), "Confirmed deliveries from WhatsApp. Earnings paid on this number only."],
            ["Failed", String(run.totals_failed), "Send attempts that failed at provider or carrier."],
            ["Attempts", String(run.totals_sent), "Messages we tried to send (sent events). Always >= Delivered."],
            ["Partner payout", fmtUsd(Number(run.total_payout_usd)), ""],
            ["Client billed", fmtUsd(Number(run.total_billed_usd)), ""],
            ["Our margin", fmtUsd(Number(run.margin_usd)), ""],
          ].map(([l, v, t]) => (
            <Card key={l} title={t || undefined}><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="text-xl font-semibold">{v}</div>
            </CardContent></Card>
          ))}
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <Button variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
              <RefreshCw className="w-4 h-4 mr-1" />Recompute
            </Button>
          )}
          <Button variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending}>
            <ShieldCheck className="w-4 h-4 mr-1" />Verify vs raw
          </Button>
          {isDraft && (
            <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Approve
            </Button>
          )}
          {(run.status === "approved" || run.status === "draft") && (
            <Button onClick={() => { setPaidAmount(String(run.total_payout_usd)); setPaidOpen(true); }}>
              Mark as paid
            </Button>
          )}
          <Button variant="outline" onClick={() => generatePdf.mutate("internal")} disabled={generatePdf.isPending}>
            <FileText className="w-4 h-4 mr-1" />Internal PDF
          </Button>
          <Button variant="outline" onClick={() => generatePdf.mutate("partner")} disabled={generatePdf.isPending}>
            <FileText className="w-4 h-4 mr-1" />Partner PDF
          </Button>
          {run.pdf_storage_path && (
            <Button variant="ghost" size="sm" onClick={() => downloadFile(run.pdf_storage_path)}>
              <Download className="w-4 h-4 mr-1" />Internal
            </Button>
          )}
          {run.partner_pdf_storage_path && (
            <Button variant="ghost" size="sm" onClick={() => downloadFile(run.partner_pdf_storage_path)}>
              <Download className="w-4 h-4 mr-1" />Partner
            </Button>
          )}
          {run.csv_storage_path && (
            <Button variant="ghost" size="sm" onClick={() => downloadFile(run.csv_storage_path)}>
              <Download className="w-4 h-4 mr-1" />CSV
            </Button>
          )}
          {run.status !== "void" && (
            <Button variant="ghost" className="text-destructive" onClick={() => setVoidOpen(true)}>
              <Ban className="w-4 h-4 mr-1" />Void
            </Button>
          )}
        </div>

        {isFrozen && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            This run is frozen. Line items and totals are immutable. Use Verify to compare against current raw data.
          </div>
        )}

        {/* Line items */}
        <Card>
          <CardHeader><CardTitle>Line items</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Day</TableHead><TableHead>Number</TableHead><TableHead>Client</TableHead>
                <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right" title="Number override → workspace override → partner default">Partner rate</TableHead>
                <TableHead className="text-right">Client rate</TableHead>
                <TableHead className="text-right">Partner payout</TableHead>
                <TableHead className="text-right">Our margin</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(items || []).map((i: any) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.day}</TableCell>
                    <TableCell>{i.number_label}</TableCell>
                    <TableCell>{i.client_label}</TableCell>
                    <TableCell className="text-right">{i.delivered}</TableCell>
                    <TableCell className="text-right">{i.failed}</TableCell>
                    <TableCell className="text-right">{fmtRate(Number(i.partner_rate_usd))}</TableCell>
                    <TableCell className="text-right">{fmtRate(Number(i.client_rate_usd))}</TableCell>
                    <TableCell className="text-right">{fmtUsd(Number(i.payout_usd))}</TableCell>
                    <TableCell className="text-right">{fmtUsd(Number(i.margin_usd))}</TableCell>
                  </TableRow>
                ))}
                {!items?.length && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No line items. Try Recompute.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Verification footer */}
        <Card>
          <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <div>Source events in window: <span className="font-mono text-foreground">{run.source_event_count}</span></div>
            <div>Source data hash: <span className="font-mono text-xs text-foreground">{run.source_data_hash || "-"}</span></div>
            <div>Generated at: {format(new Date(run.generated_at), "yyyy-MM-dd HH:mm:ss")}</div>
            {run.paid_reference && <div>Payment ref: <span className="font-mono text-foreground">{run.paid_reference}</span></div>}
            {run.paid_amount_usd != null && <div>Paid amount: {fmtUsd(Number(run.paid_amount_usd))}</div>}
          </CardContent>
        </Card>

        {/* Audit */}
        <Card>
          <CardHeader><CardTitle>Audit log</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Note</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(audit || []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{format(new Date(a.at), "yyyy-MM-dd HH:mm:ss")}</TableCell>
                    <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{a.note || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark run as paid</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Amount paid (USD)</label>
              <Input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Payment reference</label>
              <Input value={paidRef} onChange={e => setPaidRef(e.target.value)} placeholder="Wise txn ID, bank ref, …" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaidOpen(false)}>Cancel</Button>
            <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending || !paidAmount || !paidRef}>
              {markPaid.isPending ? "Saving…" : "Mark paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void this run</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Voiding is logged in the audit trail. The run still exists for history but is marked VOID.</p>
            <Input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason (required)" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => voidRun.mutate()} disabled={voidRun.isPending || !voidReason.trim()}>
              {voidRun.isPending ? "Voiding…" : "Void run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

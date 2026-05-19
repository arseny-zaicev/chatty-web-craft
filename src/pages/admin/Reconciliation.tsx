import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Download, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

type DailyRow = {
  day: string;
  whatsapp_number_id: string;
  phone_number: string | null;
  display_name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  partner_id: string | null;
  partner_name: string | null;
  recipients_sent: number;
  recipients_failed: number;
  events_sent: number;
  events_delivered: number;
  events_failed: number;
  drift_sent: number;
};

type Orphan = {
  recipient_id: string;
  campaign_id: string;
  workspace_id: string | null;
  whatsapp_number_id: string | null;
  phone_number: string | null;
  contact_phone: string;
  sent_at: string;
  provider_message_id: string | null;
};

type Summary = {
  recipients_sent: number;
  recipients_failed: number;
  events_sent: number;
  events_delivered: number;
  events_failed: number;
  orphan_count: number;
  drift_sent: number;
  drift_pct: number;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Convert YYYY-MM-DD (Dubai local) to UTC ISO range
const dubaiDayToUtcRange = (from: string, to: string) => {
  // Dubai = UTC+4. start of "from" 00:00 GST = "from"T00:00:00+04:00
  return {
    from: new Date(`${from}T00:00:00+04:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999+04:00`).toISOString(),
  };
};

const fmtDubai = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Asia/Dubai",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

const driftBadge = (drift: number, total: number) => {
  if (total === 0 && drift === 0) return null;
  const pct = total > 0 ? Math.abs((drift / total) * 100) : 0;
  if (drift === 0) return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">0</Badge>;
  if (pct <= 1) return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{drift > 0 ? "+" : ""}{drift}</Badge>;
  return <Badge variant="destructive">{drift > 0 ? "+" : ""}{drift}</Badge>;
};

const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export default function Reconciliation() {
  const [from, setFrom] = useState(daysAgoStr(7));
  const [to, setTo] = useState(todayStr());
  const range = useMemo(() => dubaiDayToUtcRange(from, to), [from, to]);

  const summaryQ = useQuery({
    queryKey: ["recon-summary", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_reconcile_summary", {
        _from: range.from, _to: range.to,
      });
      if (error) throw error;
      return (data?.[0] || null) as Summary | null;
    },
  });

  const dailyQ = useQuery({
    queryKey: ["recon-daily", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_reconcile_daily", {
        _from: range.from, _to: range.to, _partner_id: null, _workspace_id: null,
      });
      if (error) throw error;
      return (data || []) as DailyRow[];
    },
  });

  const orphansQ = useQuery({
    queryKey: ["recon-orphans", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_reconcile_orphans", {
        _from: range.from, _to: range.to,
      });
      if (error) throw error;
      return (data || []) as Orphan[];
    },
  });

  const overlappingRunsQ = useQuery({
    queryKey: ["recon-overlapping-runs", from, to],
    queryFn: async () => {
      // Payout runs whose [period_from, period_to] overlaps the [from, to] Dubai-local window
      const { data, error } = await supabase
        .from("payout_runs")
        .select("id, partner_id, role, status, period_from, period_to, total_payout_usd, auto_generated")
        .lte("period_from", to)
        .gte("period_to", from)
        .order("period_from", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const refreshAll = () => {
    summaryQ.refetch();
    dailyQ.refetch();
    orphansQ.refetch();
    overlappingRunsQ.refetch();
  };

  const s = summaryQ.data;
  const drifty = (dailyQ.data || []).filter(r => r.drift_sent !== 0).length;
  const driftyRun = s && (Math.abs(s.drift_pct) > 1 || s.orphan_count > 50);
  const overlappingRuns = overlappingRunsQ.data || [];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Button></Link>
            <h1 className="font-display text-2xl">Stats Reconciliation</h1>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" />
            <Button variant="outline" size="sm" onClick={() => { setFrom(daysAgoStr(1)); setTo(daysAgoStr(1)); }}>Yesterday</Button>
            <Button variant="outline" size="sm" onClick={() => { setFrom(daysAgoStr(7)); setTo(todayStr()); }}>7d</Button>
            <Button variant="outline" size="sm" onClick={() => { setFrom(daysAgoStr(30)); setTo(todayStr()); }}>30d</Button>
            <Button variant="ghost" size="icon" onClick={refreshAll} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Сравнение того, что мы помечаем как отправлено в кампаниях, с фактическими webhook-событиями от Gupshup.
          Источник истины для платежей партнёрам — события <code>delivered</code>. Если drift &gt; 1% — webhook'и теряются и партнёр недоплачен/переплачен.
          Время в Dubai (GST).
        </p>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Recipients sent (DB)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{s?.recipients_sent?.toLocaleString() ?? "-"}</div>
              <div className="text-xs text-muted-foreground mt-1">Failed: {s?.recipients_failed ?? "-"}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Events sent (webhook)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{s?.events_sent?.toLocaleString() ?? "-"}</div>
              <div className="text-xs text-muted-foreground mt-1">Delivered: {s?.events_delivered ?? "-"} · Failed: {s?.events_failed ?? "-"}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Drift (recipients - events)</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${(s?.drift_sent ?? 0) === 0 ? "text-emerald-600" : Math.abs(s?.drift_pct ?? 0) > 1 ? "text-destructive" : "text-amber-600"}`}>
                {s?.drift_sent ?? "-"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s?.drift_pct ?? 0}% от sent</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Orphan recipients</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${(s?.orphan_count ?? 0) === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {s?.orphan_count ?? "-"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Sent в DB, но нет webhook</div>
            </CardContent>
          </Card>
        </div>

        {/* Verdict */}
        {s && (
          <Card className={Math.abs(s.drift_pct) > 1 || s.orphan_count > 50
            ? "border-destructive/50 bg-destructive/5"
            : "border-emerald-500/30 bg-emerald-50/50"}>
            <CardContent className="pt-6 flex items-start gap-3">
              {Math.abs(s.drift_pct) > 1 || s.orphan_count > 50
                ? <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                : <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />}
              <div className="text-sm">
                {Math.abs(s.drift_pct) > 1
                  ? <><b>Расхождение {s.drift_pct}%</b> между нашим счётчиком и webhook-событиями. Не утверждай payout, пока не разберёшься. Возможные причины: пропущенные webhook'и, дубли, race condition в обработчике.</>
                  : s.orphan_count > 50
                  ? <><b>{s.orphan_count} получателей без webhook-подтверждения.</b> Сообщения помечены как отправленные, но Gupshup не подтвердил доставку. Проверь логи функции <code>whatsapp-webhook</code>.</>
                  : <><b>Статистика согласована.</b> Drift {s.drift_pct}%, orphans {s.orphan_count}. Можно платить партнёрам.</>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Per-day per-number ({drifty} строк с расхождением)</CardTitle>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`reconciliation-${from}_to_${to}.csv`, dailyQ.data || [])}>
              <Download className="w-4 h-4 mr-1" />CSV
            </Button>
          </CardHeader>
          <CardContent>
            {dailyQ.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">DB sent</TableHead>
                      <TableHead className="text-right">Evt sent</TableHead>
                      <TableHead className="text-right">Evt deliv.</TableHead>
                      <TableHead className="text-right">Evt fail</TableHead>
                      <TableHead className="text-right">Drift</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dailyQ.data || []).map((r, i) => (
                      <TableRow key={`${r.day}-${r.whatsapp_number_id}-${i}`}
                        className={r.drift_sent !== 0 ? "bg-amber-50/30" : ""}>
                        <TableCell>{r.day}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.phone_number || "?"}
                          {r.display_name && <div className="text-muted-foreground text-xs">{r.display_name}</div>}
                        </TableCell>
                        <TableCell className="text-xs">{r.workspace_name || "-"}</TableCell>
                        <TableCell className="text-xs">{r.partner_name || <span className="text-muted-foreground">unassigned</span>}</TableCell>
                        <TableCell className="text-right">{r.recipients_sent}</TableCell>
                        <TableCell className="text-right">{r.events_sent}</TableCell>
                        <TableCell className="text-right">{r.events_delivered}</TableCell>
                        <TableCell className="text-right">{r.events_failed}</TableCell>
                        <TableCell className="text-right">{driftBadge(r.drift_sent, r.recipients_sent)}</TableCell>
                      </TableRow>
                    ))}
                    {!(dailyQ.data || []).length && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Нет данных за период</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Orphans */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Orphan recipients ({orphansQ.data?.length ?? 0}, max 500)</CardTitle>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(`orphans-${from}_to_${to}.csv`, orphansQ.data || [])}>
              <Download className="w-4 h-4 mr-1" />CSV
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Получатели, помеченные как <code>sent</code> в БД, но без соответствующего webhook-события (ни по recipient_id, ни по provider_message_id). Это значит мы потеряли подтверждение доставки.
            </p>
            {orphansQ.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <div className="overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10"><TableRow>
                    <TableHead>Sent at (GST)</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Provider msg id</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(orphansQ.data || []).map(o => (
                      <TableRow key={o.recipient_id}>
                        <TableCell className="text-xs">{fmtDubai(o.sent_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{o.phone_number || "?"}</TableCell>
                        <TableCell className="font-mono text-xs">{o.contact_phone}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{o.provider_message_id || <span className="text-destructive">missing</span>}</TableCell>
                      </TableRow>
                    ))}
                    {!(orphansQ.data || []).length && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Нет orphan'ов 🎉</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

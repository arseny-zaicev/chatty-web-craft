import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, BarChart3, AlertTriangle, Send, CheckCircle2, Eye, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Period = "7" | "30" | "90";

type EventRow = {
  whatsapp_number_id: string | null;
  event_type: string;
  error_code: string | null;
  error_message: string | null;
  received_at: string;
  campaign_recipient_id: string | null;
};

type NumberRow = {
  id: string;
  phone_number: string;
  display_name: string | null;
  label: string | null;
  status: string;
  workspace_id: string | null;
  workspace_name: string;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  workspace_name: string;
  reply_count: number;
};

const fetchAnalytics = async (period: Period) => {
  const sinceIso = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: events, error: eErr }, { data: numbers }, { data: workspaces }, { data: campaigns }, { data: convs }] =
    await Promise.all([
      supabase.from("whatsapp_message_events")
        .select("whatsapp_number_id, event_type, error_code, error_message, received_at, campaign_recipient_id")
        .gte("received_at", sinceIso)
        .order("received_at", { ascending: false })
        .limit(50000),
      supabase.from("whatsapp_numbers").select("id, phone_number, display_name, label, status, workspace_id"),
      supabase.from("workspaces").select("id, name"),
      supabase.from("campaigns").select("id, name, status, total_recipients, sent_count, failed_count, created_at, workspace_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false }),
      supabase.from("conversations").select("whatsapp_number_id, last_message_at, unread_count"),
    ]);

  if (eErr) throw eErr;

  const wsMap = new Map((workspaces ?? []).map((w) => [w.id, w.name]));

  // Per-number aggregation
  const perNumber = new Map<string, { sent: number; delivered: number; read: number; failed: number; lastSent: string | null }>();
  for (const e of (events ?? []) as EventRow[]) {
    if (!e.whatsapp_number_id) continue;
    const cur = perNumber.get(e.whatsapp_number_id) ?? { sent: 0, delivered: 0, read: 0, failed: 0, lastSent: null };
    if (e.event_type === "sent" || e.event_type === "enqueued") {
      cur.sent += 1;
      if (!cur.lastSent || e.received_at > cur.lastSent) cur.lastSent = e.received_at;
    }
    if (e.event_type === "delivered") cur.delivered += 1;
    if (e.event_type === "read") cur.read += 1;
    if (e.event_type === "failed" || e.event_type === "error") cur.failed += 1;
    perNumber.set(e.whatsapp_number_id, cur);
  }

  const numberRows: (NumberRow & { sent: number; delivered: number; read: number; failed: number; lastSent: string | null })[] =
    (numbers ?? []).map((n) => {
      const stats = perNumber.get(n.id) ?? { sent: 0, delivered: 0, read: 0, failed: 0, lastSent: null };
      return {
        id: n.id,
        phone_number: n.phone_number,
        display_name: n.display_name,
        label: n.label,
        status: n.status,
        workspace_id: n.workspace_id,
        workspace_name: n.workspace_id ? (wsMap.get(n.workspace_id) ?? "—") : "Unassigned",
        ...stats,
      };
    });

  // Totals
  let totSent = 0, totDelivered = 0, totRead = 0, totFailed = 0;
  for (const e of (events ?? []) as EventRow[]) {
    if (e.event_type === "sent" || e.event_type === "enqueued") totSent += 1;
    else if (e.event_type === "delivered") totDelivered += 1;
    else if (e.event_type === "read") totRead += 1;
    else if (e.event_type === "failed" || e.event_type === "error") totFailed += 1;
  }

  // Top errors
  const errorMap = new Map<string, number>();
  for (const e of (events ?? []) as EventRow[]) {
    if (e.event_type !== "failed" && e.event_type !== "error") continue;
    const key = e.error_message?.trim() || e.error_code || "Unknown error";
    errorMap.set(key, (errorMap.get(key) ?? 0) + 1);
  }
  const topErrors = Array.from(errorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([msg, count]) => ({ msg, count }));

  // Hour heatmap (sent events by hour 0-23)
  const hourBuckets = new Array(24).fill(0);
  for (const e of (events ?? []) as EventRow[]) {
    if (e.event_type !== "sent" && e.event_type !== "enqueued") continue;
    const h = new Date(e.received_at).getUTCHours();
    hourBuckets[h] += 1;
  }

  // Campaign performance: get reply count via inbound conversations matching campaign window
  // Simpler proxy: sum of unread_count + last_message_at >= campaign created_at on that workspace's numbers.
  // For accuracy without heavy joins, just leave reply_count 0 for now and show core stats.
  const campaignRows: CampaignRow[] = (campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    total_recipients: c.total_recipients,
    sent_count: c.sent_count,
    failed_count: c.failed_count,
    created_at: c.created_at,
    workspace_name: wsMap.get(c.workspace_id) ?? "—",
    reply_count: 0,
  }));

  // Active numbers in period
  const activeNumbers = numberRows.filter((n) => n.sent > 0).length;

  return {
    totals: { sent: totSent, delivered: totDelivered, read: totRead, failed: totFailed, activeNumbers },
    numbers: numberRows.sort((a, b) => b.sent - a.sent),
    topErrors,
    hourBuckets,
    campaigns: campaignRows,
  };
};

export default function FleetAnalytics() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [period, setPeriod] = useState<Period>("30");

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { evaluateAdminAccess } = await import("@/lib/adminGuard");
      const r = await evaluateAdminAccess();
      if (!mounted) return;
      if (r.state === "redirect") {
        if (r.reason === "not-admin") toast.error("Admin only");
        navigate(r.to);
      } else {
        setAuthChecked(true);
      }
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { check(); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["fleet-analytics", period],
    queryFn: () => fetchAnalytics(period),
    enabled: authChecked,
  });

  const pct = (num: number, denom: number) => denom > 0 ? Math.round((num / denom) * 100) : 0;

  const maxHour = useMemo(() => Math.max(1, ...(data?.hourBuckets ?? [0])), [data?.hourBuckets]);

  if (!authChecked || isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const t = data!.totals;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" />Admin</Link></Button>
          <h1 className="font-display text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />Fleet Analytics
          </h1>
          <span className="text-xs text-muted-foreground">Internal data only - Gupshup billing/quality not yet wired</span>
          <div className="ml-auto flex gap-1">
            {(["7", "30", "90"] as Period[]).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
                {p}d
              </Button>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard icon={<Send className="w-4 h-4" />} label="Sent" value={t.sent.toLocaleString()} />
          <KpiCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Delivered"
            value={t.delivered.toLocaleString()} sub={`${pct(t.delivered, t.sent)}% of sent`} />
          <KpiCard icon={<Eye className="w-4 h-4 text-sky-600" />} label="Read"
            value={t.read.toLocaleString()} sub={`${pct(t.read, t.delivered)}% of delivered`} />
          <KpiCard icon={<AlertTriangle className="w-4 h-4 text-red-600" />} label="Failed"
            value={t.failed.toLocaleString()} sub={`${pct(t.failed, t.sent + t.failed)}% failure rate`} />
          <KpiCard icon={<MessageCircle className="w-4 h-4 text-amber-600" />} label="Active numbers"
            value={String(t.activeNumbers)} sub={`sent ≥1 msg / ${period}d`} />
        </div>

        {/* Hour heatmap */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sending activity by hour (UTC)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {data!.hourBuckets.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${i}:00 UTC - ${v} sent`}>
                  <div
                    className="w-full bg-primary/70 hover:bg-primary rounded-sm transition-colors"
                    style={{ height: `${(v / maxHour) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                  />
                  <div className="text-[9px] text-muted-foreground tabular-nums">{i}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Top errors */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Top errors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data!.topErrors.length === 0 ? (
                <div className="text-xs text-muted-foreground">No errors in this period.</div>
              ) : data!.topErrors.map((e, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-xs border-b border-border/50 pb-2 last:border-0">
                  <span className="text-muted-foreground line-clamp-2 flex-1" title={e.msg}>{e.msg}</span>
                  <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 border-red-500/30 shrink-0">
                    {e.count.toLocaleString()}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Per-number health */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Per-number health (last {period} days)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Deliv%</TableHead>
                    <TableHead className="text-right">Read%</TableHead>
                    <TableHead className="text-right">Fail%</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.numbers.slice(0, 20).map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">+{n.phone_number}<div className="text-[10px] text-muted-foreground">{n.label || n.display_name || "—"}</div></TableCell>
                      <TableCell className="text-xs">{n.workspace_name}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">{n.sent.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{n.sent > 0 ? `${pct(n.delivered, n.sent)}%` : "—"}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{n.delivered > 0 ? `${pct(n.read, n.delivered)}%` : "—"}</TableCell>
                      <TableCell className={`text-xs text-right tabular-nums ${pct(n.failed, n.sent + n.failed) > 5 ? "text-red-600 font-medium" : ""}`}>
                        {(n.sent + n.failed) > 0 ? `${pct(n.failed, n.sent + n.failed)}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data!.numbers.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No data yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Campaign performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Campaign performance (last {period} days)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Send rate</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.campaigns.slice(0, 25).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs font-medium max-w-[220px] truncate" title={c.name}>{c.name}</TableCell>
                    <TableCell className="text-xs">{c.workspace_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{c.status}</Badge></TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{c.total_recipients.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{c.sent_count.toLocaleString()}</TableCell>
                    <TableCell className={`text-xs text-right tabular-nums ${c.failed_count > 0 ? "text-red-600" : ""}`}>{c.failed_count.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{c.total_recipients > 0 ? `${pct(c.sent_count, c.total_recipients)}%` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</TableCell>
                  </TableRow>
                ))}
                {data!.campaigns.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">No campaigns in this period.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">{icon}{label}</div>
        <div className="text-2xl font-display font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

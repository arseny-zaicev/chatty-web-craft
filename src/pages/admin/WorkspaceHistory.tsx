// Workspace / Client history & accounting view.
//
// One reliable client-level accounting surface. For every workspace shows
// canonical sent / delivered / failed / replied across Today, 7d, 30d, All-time
// plus active campaign + number counts. Drilldowns expose the per-campaign and
// per-number truth that backs each workspace row, so totals can be reconciled
// against the campaign- and number-level sources without leaving the page.
//
// Canonical sources (do NOT swap for lagging counters):
//   - workspace + per-number sent/delivered/failed/replies → metrics_for_range
//     (event-based, dedup'd by provider_message_id; one row per
//      (workspace_id, whatsapp_number_id)).
//   - per-campaign sent/delivered/failed/replied              → campaign_metrics_for_range
//   - active campaign / active number counts                  → live table reads.
//
// Reconciliation note: metrics_for_range and campaign_metrics_for_range both
// reduce over the same whatsapp_message_events table with the same dedup key,
// so for any workspace W and date range R:
//     Σ metrics_for_range(W, R, .sent)  ==  Σ campaign_metrics_for_range(W's campaigns, R, .sent)
// up to recipient rows whose campaign_id was deleted (rare, surfaced as
// "orphan events" below). Drilldown shows the two sums side-by-side.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle,
} from "lucide-react";

type Range = "today" | "7d" | "30d" | "alltime";

const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  alltime: "All-time",
};

// Dubai midnight today, in ISO (GST = UTC+4). Mirrors fetchCampaignTruth.
function dubaiStartOfDayIso(): string {
  const dubaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  return new Date(`${dubaiDate}T00:00:00+04:00`).toISOString();
}

function rangeBounds(r: Range): { from: string; to: string } {
  const to = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  if (r === "today") return { from: dubaiStartOfDayIso(), to };
  if (r === "7d") return { from: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(), to };
  if (r === "30d") return { from: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(), to };
  return { from: "1970-01-01T00:00:00Z", to };
}

type NumberMetricRow = {
  workspace_id: string | null;
  whatsapp_number_id: string | null;
  sent: number;
  delivered: number;
  failed: number;
  replies: number;
};

type CampaignMetricRow = {
  campaign_id: string;
  sent: number;
  delivered: number;
  failed: number;
  replied: number;
};

type WorkspaceLite = { id: string; name: string; slug: string | null };
type NumberLite = { id: string; phone_number: string; display_name: string | null; label: string | null; status: string; workspace_id: string | null; is_active: boolean };
type CampaignLite = { id: string; name: string; status: string; workspace_id: string | null; created_at: string };

// "Active campaign" = not finished/dead. Mirrors portfolioMetrics.
const ACTIVE_CAMPAIGN_STATUSES = new Set(["scheduled", "running", "paused", "queued"]);

async function fetchHistory(range: Range) {
  const { from, to } = rangeBounds(range);
  const [
    metricsRes,
    workspacesRes,
    numbersRes,
    campaignsRes,
  ] = await Promise.all([
    // CANONICAL per-(workspace, number) truth across the chosen window.
    (supabase.rpc as any)("metrics_for_range", { _workspace_id: null, _from: from, _to: to, _source: "all" }),
    supabase.from("workspaces").select("id, name, slug, is_active").eq("is_active", true).order("name"),
    supabase.from("whatsapp_numbers").select("id, phone_number, display_name, label, status, workspace_id, is_active"),
    supabase.from("campaigns").select("id, name, status, workspace_id, created_at"),
  ]);

  if (metricsRes.error) throw metricsRes.error;
  if (workspacesRes.error) throw workspacesRes.error;

  const metrics = (metricsRes.data ?? []) as NumberMetricRow[];
  const workspaces = (workspacesRes.data ?? []) as WorkspaceLite[];
  const numbers = (numbersRes.data ?? []) as NumberLite[];
  const campaigns = (campaignsRes.data ?? []) as CampaignLite[];

  // Per-campaign truth for the same window — used by drilldown AND by the
  // workspace-level Σ check.
  const allCampaignIds = campaigns.map((c) => c.id);
  let campaignTruth: CampaignMetricRow[] = [];
  if (allCampaignIds.length) {
    // Chunk to avoid huge IN-lists / payloads.
    const chunkSize = 500;
    for (let i = 0; i < allCampaignIds.length; i += chunkSize) {
      const slice = allCampaignIds.slice(i, i + chunkSize);
      const { data, error } = await (supabase.rpc as any)("campaign_metrics_for_range", {
        p_campaign_ids: slice, _from: from, _to: to,
      });
      if (error) throw error;
      campaignTruth.push(...((data ?? []) as CampaignMetricRow[]));
    }
  }

  return { metrics, workspaces, numbers, campaigns, campaignTruth, from, to };
}

type WorkspaceTotals = {
  sent: number; delivered: number; failed: number; replies: number;
  campaignSent: number; campaignDelivered: number; campaignFailed: number; campaignReplied: number;
  activeCampaigns: number; activeNumbers: number; campaignsInRange: number;
};

const zeroTotals = (): WorkspaceTotals => ({
  sent: 0, delivered: 0, failed: 0, replies: 0,
  campaignSent: 0, campaignDelivered: 0, campaignFailed: 0, campaignReplied: 0,
  activeCampaigns: 0, activeNumbers: 0, campaignsInRange: 0,
});

export default function WorkspaceHistory() {
  const [range, setRange] = useState<Range>("today");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["admin", "workspace-history", range],
    queryFn: () => fetchHistory(range),
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    if (!q.data) return [] as Array<{ ws: WorkspaceLite; totals: WorkspaceTotals }>;
    const { metrics, workspaces, numbers, campaigns, campaignTruth } = q.data;

    const totalsByWs = new Map<string, WorkspaceTotals>();
    const ensure = (id: string) => {
      let v = totalsByWs.get(id);
      if (!v) { v = zeroTotals(); totalsByWs.set(id, v); }
      return v;
    };
    workspaces.forEach((w) => ensure(w.id));

    metrics.forEach((r) => {
      if (!r.workspace_id) return;
      const t = ensure(r.workspace_id);
      t.sent += Number(r.sent ?? 0);
      t.delivered += Number(r.delivered ?? 0);
      t.failed += Number(r.failed ?? 0);
      t.replies += Number(r.replies ?? 0);
    });

    numbers.forEach((n) => {
      if (!n.workspace_id) return;
      const t = ensure(n.workspace_id);
      if (n.is_active) t.activeNumbers += 1;
    });

    const truthMap = new Map(campaignTruth.map((c) => [c.campaign_id, c]));
    campaigns.forEach((c) => {
      if (!c.workspace_id) return;
      const t = ensure(c.workspace_id);
      if (ACTIVE_CAMPAIGN_STATUSES.has((c.status || "").toLowerCase())) t.activeCampaigns += 1;
      const truth = truthMap.get(c.id);
      if (truth) {
        const had = truth.sent + truth.delivered + truth.failed + truth.replied > 0;
        if (had) t.campaignsInRange += 1;
        t.campaignSent += Number(truth.sent ?? 0);
        t.campaignDelivered += Number(truth.delivered ?? 0);
        t.campaignFailed += Number(truth.failed ?? 0);
        t.campaignReplied += Number(truth.replied ?? 0);
      }
    });

    return workspaces
      .map((ws) => ({ ws, totals: ensure(ws.id) }))
      .sort((a, b) => b.totals.sent - a.totals.sent || a.ws.name.localeCompare(b.ws.name));
  }, [q.data]);

  const grandTotals = useMemo(() => {
    const acc = zeroTotals();
    rows.forEach((r) => {
      acc.sent += r.totals.sent; acc.delivered += r.totals.delivered;
      acc.failed += r.totals.failed; acc.replies += r.totals.replies;
      acc.activeCampaigns += r.totals.activeCampaigns;
      acc.activeNumbers += r.totals.activeNumbers;
    });
    return acc;
  }, [rows]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Admin</Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Workspace history</h1>
            <p className="text-xs text-muted-foreground">
              Canonical client-level accounting. Sent / delivered / failed / replied from{" "}
              <code className="font-mono text-[11px]">metrics_for_range</code>; per-campaign drilldown from{" "}
              <code className="font-mono text-[11px]">campaign_metrics_for_range</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
              <TabsTrigger value="alltime">All-time</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="text-xs text-muted-foreground">{RANGE_LABEL[range]} · Dubai (UTC+4)</div>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        ) : q.isError ? (
          <Card><CardContent className="p-4 text-sm text-rose-600">Failed to load: {(q.error as any)?.message}</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Portfolio totals · {RANGE_LABEL[range]}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <Stat label="Sent" value={grandTotals.sent} />
                <Stat label="Delivered" value={grandTotals.delivered} />
                <Stat label="Failed" value={grandTotals.failed} />
                <Stat label="Replied" value={grandTotals.replies} />
                <Stat label="Active campaigns" value={grandTotals.activeCampaigns} />
                <Stat label="Active numbers" value={grandTotals.activeNumbers} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Replied</TableHead>
                      <TableHead className="text-right">Active campaigns</TableHead>
                      <TableHead className="text-right">Active numbers</TableHead>
                      <TableHead className="text-right">Σ check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No workspaces.</TableCell></TableRow>
                    )}
                    {rows.map(({ ws, totals }) => {
                      const open = expanded.has(ws.id);
                      // Σ check: workspace sent (per-number rollup) vs campaign sent (per-campaign rollup).
                      // Both reduce over whatsapp_message_events; deltas indicate
                      // events whose campaign_id was deleted or never set.
                      const delta = totals.sent - totals.campaignSent;
                      return (
                        <>
                          <TableRow
                            key={ws.id}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => toggle(ws.id)}
                          >
                            <TableCell>
                              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </TableCell>
                            <TableCell className="font-medium">
                              {ws.name}
                              {ws.slug && <span className="text-xs text-muted-foreground ml-2">/{ws.slug}</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{totals.sent.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{totals.delivered.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{totals.failed.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{totals.replies.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{totals.activeCampaigns}</TableCell>
                            <TableCell className="text-right tabular-nums">{totals.activeNumbers}</TableCell>
                            <TableCell className="text-right">
                              {delta === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> match
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-600 text-xs" title={`number-rollup sent ${totals.sent} − campaign-rollup sent ${totals.campaignSent}`}>
                                  <AlertTriangle className="w-3.5 h-3.5" /> {delta > 0 ? "+" : ""}{delta}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                          {open && q.data && (
                            <TableRow key={`${ws.id}-detail`}>
                              <TableCell></TableCell>
                              <TableCell colSpan={8} className="bg-muted/20">
                                <Drilldown
                                  workspaceId={ws.id}
                                  totals={totals}
                                  metrics={q.data.metrics}
                                  numbers={q.data.numbers}
                                  campaigns={q.data.campaigns}
                                  campaignTruth={q.data.campaignTruth}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function Drilldown(props: {
  workspaceId: string;
  totals: WorkspaceTotals;
  metrics: NumberMetricRow[];
  numbers: NumberLite[];
  campaigns: CampaignLite[];
  campaignTruth: CampaignMetricRow[];
}) {
  const { workspaceId, totals, metrics, numbers, campaigns, campaignTruth } = props;

  const numberRows = useMemo(() => {
    const numMap = new Map(numbers.map((n) => [n.id, n]));
    const acc = new Map<string, { sent: number; delivered: number; failed: number; replies: number }>();
    metrics.forEach((m) => {
      if (m.workspace_id !== workspaceId || !m.whatsapp_number_id) return;
      const cur = acc.get(m.whatsapp_number_id) ?? { sent: 0, delivered: 0, failed: 0, replies: 0 };
      cur.sent += Number(m.sent ?? 0); cur.delivered += Number(m.delivered ?? 0);
      cur.failed += Number(m.failed ?? 0); cur.replies += Number(m.replies ?? 0);
      acc.set(m.whatsapp_number_id, cur);
    });
    return [...acc.entries()]
      .map(([id, v]) => ({ id, number: numMap.get(id), ...v }))
      .sort((a, b) => b.sent - a.sent);
  }, [metrics, numbers, workspaceId]);

  const campaignRows = useMemo(() => {
    const truthMap = new Map(campaignTruth.map((c) => [c.campaign_id, c]));
    return campaigns
      .filter((c) => c.workspace_id === workspaceId)
      .map((c) => {
        const t = truthMap.get(c.id) ?? { campaign_id: c.id, sent: 0, delivered: 0, failed: 0, replied: 0 };
        return { campaign: c, ...t };
      })
      .filter((r) => r.sent + r.delivered + r.failed + r.replied > 0 || ACTIVE_CAMPAIGN_STATUSES.has((r.campaign.status || "").toLowerCase()))
      .sort((a, b) => b.sent - a.sent);
  }, [campaigns, campaignTruth, workspaceId]);

  return (
    <div className="py-3 space-y-4">
      <div className="text-xs text-muted-foreground">
        Workspace-level sent <b className="text-foreground">{totals.sent.toLocaleString()}</b> (from{" "}
        <code className="font-mono">metrics_for_range</code>) vs sum of per-campaign sent{" "}
        <b className="text-foreground">{totals.campaignSent.toLocaleString()}</b> (from{" "}
        <code className="font-mono">campaign_metrics_for_range</code>).{" "}
        Both reduce over the same event table with the same dedup key — any delta is from events whose campaign_id was deleted.
      </div>

      <div>
        <div className="text-xs font-semibold mb-1 flex items-center gap-2">
          Campaigns ({campaignRows.length})
          <Badge variant="outline" className="text-[10px]">campaign_metrics_for_range</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Replied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaignRows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-3">No campaign activity in range.</TableCell></TableRow>
            )}
            {campaignRows.map((r) => (
              <TableRow key={r.campaign.id}>
                <TableCell className="font-mono text-xs">{r.campaign.name}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{r.campaign.status}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{r.sent.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.delivered.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.failed.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.replied.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <div className="text-xs font-semibold mb-1 flex items-center gap-2">
          Numbers ({numberRows.length})
          <Badge variant="outline" className="text-[10px]">metrics_for_range</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Replied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numberRows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-3">No number activity in range.</TableCell></TableRow>
            )}
            {numberRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {r.number?.phone_number ?? r.id}
                  {r.number?.display_name && <span className="text-muted-foreground ml-2">{r.number.display_name}</span>}
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{r.number?.status ?? "—"}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{r.sent.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.delivered.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.failed.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.replies.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

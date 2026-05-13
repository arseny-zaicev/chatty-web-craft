// Campaign report: tabs (Summary / Segments / Templates) + CSV export + AI insights.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";

type SegmentRow = { value: string; n: number; sent: number; replied: number; positive: number; reply_rate: number; positive_rate: number };
type Metrics = {
  totals?: { total: number; sent: number; failed: number; replied: number; positive: number; meeting: number };
  by_segment?: Record<string, SegmentRow[]>;
  by_template?: SegmentRow[];
  by_number?: SegmentRow[];
};

type Insight = {
  campaign_id: string;
  summary_md: string | null;
  metrics: Metrics | null;
  generated_at: string;
  model: string | null;
};

async function fetchInsight(campaignId: string): Promise<Insight | null> {
  const { data } = await supabase
    .from("campaign_insights")
    .select("campaign_id, summary_md, metrics, generated_at, model")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  return (data as Insight | null) ?? null;
}

type LiveTotals = { total: number; sent: number; failed: number; pending: number; replied: number; positive: number; meeting: number };

async function fetchLiveTotals(campaignIds: string[]): Promise<LiveTotals> {
  const empty: LiveTotals = { total: 0, sent: 0, failed: 0, pending: 0, replied: 0, positive: 0, meeting: 0 };
  if (campaignIds.length === 0) return empty;
  const { data, error } = await supabase.rpc("campaign_live_counts", { p_campaign_ids: campaignIds });
  if (error || !data) return empty;
  return (data as any[]).reduce<LiveTotals>((acc, r) => ({
    total:    acc.total    + Number(r.total ?? 0),
    sent:     acc.sent     + Number(r.sent ?? 0),
    failed:   acc.failed   + Number(r.failed ?? 0),
    pending:  acc.pending  + Number(r.pending ?? 0),
    replied:  acc.replied  + Number(r.replied ?? 0),
    positive: acc.positive + Number(r.positive ?? 0),
    meeting:  acc.meeting  + Number(r.meeting ?? 0),
  }), empty);
}

async function downloadCsv(campaignId: string, campaignName: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) throw new Error("Not signed in");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campaign-report-export?campaign_id=${campaignId}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
  const blob = await resp.blob();
  const a = document.createElement("a");
  const objUrl = URL.createObjectURL(blob);
  const safe = campaignName.replace(/[^a-z0-9-_]+/gi, "_");
  a.href = objUrl;
  a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

const SEGMENT_LABELS: Record<string, string> = {
  industry: "Industry",
  role: "Role",
  title: "Job title",
  country: "Country",
  city: "City",
  company_size: "Company size",
  employees: "Employees",
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#6366f1", "#ec4899", "#06b6d4", "#84cc16"];

function SegmentChart({ rows, metric }: { rows: SegmentRow[]; metric: "positive_rate" | "reply_rate" }) {
  const data = rows.slice(0, 8).map((r) => ({
    name: r.value.length > 24 ? `${r.value.slice(0, 22)}…` : r.value,
    value: r[metric],
    n: r.n,
  }));
  return (
    <ChartContainer
      config={{ value: { label: metric === "positive_rate" ? "Positive %" : "Reply %", color: "hsl(var(--primary))" } }}
      className="h-[220px] w-full"
    >
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function CampaignReportPanel({
  campaignIds,
  primaryCampaignId,
  campaignName,
}: {
  campaignIds: string[];
  primaryCampaignId: string;
  campaignName: string;
}) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  const { data: insight, isLoading: loadingInsight } = useQuery({
    queryKey: ["campaign-insight", primaryCampaignId],
    queryFn: () => fetchInsight(primaryCampaignId),
  });

  // Live totals — never read from the cached insight snapshot.
  const { data: liveTotals } = useQuery({
    queryKey: ["campaign-live-counts", campaignIds.slice().sort().join(",")],
    queryFn: () => fetchLiveTotals(campaignIds),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("campaign-insights", {
        body: { campaign_id: primaryCampaignId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-insight", primaryCampaignId] });
      toast({ title: "Insights generated" });
    },
    onError: (e: unknown) => {
      toast({ title: "Failed to generate insights", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    },
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      for (const id of campaignIds) await downloadCsv(id, campaignName);
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const metrics = insight?.metrics ?? null;
  const segments = metrics?.by_segment ?? {};
  const templates = metrics?.by_template ?? [];

  return (
    <div className="rounded-md border border-border bg-card/30 p-3 mt-3">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intelligence report</div>
          <div className="text-[11px] text-muted-foreground">AI summary, segment performance, full per-contact CSV.</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            CSV
          </Button>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            {insight ? "Regenerate" : "Generate insights"}
          </Button>
        </div>
      </div>

      {loadingInsight ? (
        <div className="text-xs text-muted-foreground">Loading insights…</div>
      ) : !insight ? (
        <div className="text-xs text-muted-foreground">
          No insights yet. They auto-generate within ~15 min after a campaign completes, or click <strong>Generate insights</strong>.
        </div>
      ) : (
        <Tabs defaultValue="summary">
          <TabsList className="h-8">
            <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
            <TabsTrigger value="segments" className="text-xs">Segments</TabsTrigger>
            <TabsTrigger value="templates" className="text-xs">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-3 space-y-3">
            {totals && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <KpiMini label="Total" value={totals.total} />
                <KpiMini label="Sent" value={totals.sent} tone="good" />
                <KpiMini label="Failed" value={totals.failed} tone={totals.failed > 0 ? "bad" : undefined} />
                <KpiMini label="Replied" value={totals.replied} />
                <KpiMini label="Positive" value={totals.positive} tone="good" />
                <KpiMini label="Meeting" value={totals.meeting} tone="good" />
              </div>
            )}
            {insight.summary_md && (
              <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap rounded border border-border bg-background/40 p-3">
                {insight.summary_md}
                <div className="text-[10px] text-muted-foreground mt-2 not-prose">
                  Generated {new Date(insight.generated_at).toLocaleString()} · {insight.model}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="segments" className="mt-3 space-y-4">
            {Object.keys(segments).length === 0 ? (
              <div className="text-xs text-muted-foreground">Not enough segmented data. Add fields like industry, role, country to your audience payload.</div>
            ) : (
              Object.entries(segments).map(([field, rows]) => (
                <div key={field}>
                  <div className="text-xs font-semibold mb-1.5">{SEGMENT_LABELS[field] ?? field} - top by positive rate</div>
                  <SegmentChart rows={rows} metric="positive_rate" />
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="templates" className="mt-3">
            {templates.length === 0 ? (
              <div className="text-xs text-muted-foreground">Only one template was used in this campaign.</div>
            ) : (
              <div>
                <div className="text-xs font-semibold mb-1.5">Templates by reply rate</div>
                <SegmentChart rows={templates} metric="reply_rate" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const KpiMini = ({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) => (
  <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-semibold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
  </div>
);

// Latest completed campaign report card for the workspace Overview page.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Totals = { total: number; sent: number; failed: number; replied: number; positive: number; meeting: number };

async function fetchLatestReport(workspaceId: string) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, updated_at, sent_count, total_recipients")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!campaign) return null;
  const { data: insight } = await supabase
    .from("campaign_insights")
    .select("summary_md, metrics, generated_at")
    .eq("campaign_id", campaign.id)
    .maybeSingle();
  return { campaign, insight: insight ?? null };
}

export function LatestReportCard({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["latest-report", workspaceId],
    queryFn: () => fetchLatestReport(workspaceId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" />Latest report</CardTitle></CardHeader>
        <CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { campaign, insight } = data;
  const totals = (insight?.metrics as { totals?: Totals } | null)?.totals;
  const summary = insight?.summary_md ?? null;
  const summaryShort = summary ? summary.split("\n").slice(0, 6).join("\n") : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />Latest campaign report
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {formatDistanceToNow(new Date(campaign.updated_at), { addSuffix: true })}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground truncate mt-1">{campaign.name}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {totals ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Mini label="Sent" value={totals.sent} />
            <Mini label="Replied" value={totals.replied} />
            <Mini label="Positive" value={totals.positive} tone="good" />
            <Mini label="Meeting" value={totals.meeting} tone="good" />
            <Mini label="Failed" value={totals.failed} tone={totals.failed > 0 ? "bad" : undefined} />
            <Mini label="Total" value={totals.total} />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Sent {campaign.sent_count}/{campaign.total_recipients}. AI insights are generating in the background (auto every ~15 min after completion).
          </div>
        )}

        {summaryShort && (
          <div className="rounded border border-border bg-background/40 p-3 text-sm whitespace-pre-wrap line-clamp-[10]">
            {summaryShort}
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link to={`/ws/${slug}/campaigns`}>Open full report<ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const Mini = ({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) => (
  <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-base font-display font-semibold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
  </div>
);

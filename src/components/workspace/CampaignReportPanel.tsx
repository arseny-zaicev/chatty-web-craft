// Campaign report panel: download per-recipient CSV + generate AI insights summary.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

type Insight = {
  campaign_id: string;
  summary_md: string | null;
  metrics: Record<string, unknown> | null;
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
      // For multi-number campaigns, download each child campaign's CSV.
      for (const id of campaignIds) {
        await downloadCsv(id, campaignName);
      }
    } catch (e) {
      toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/30 p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report</div>
          <div className="text-[11px] text-muted-foreground">Download per-contact data or generate an AI summary of what worked.</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            CSV
          </Button>
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            {insight ? "Regenerate insights" : "Generate insights"}
          </Button>
        </div>
      </div>

      {loadingInsight ? (
        <div className="text-xs text-muted-foreground">Loading insights…</div>
      ) : insight?.summary_md ? (
        <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap rounded border border-border bg-background/40 p-3">
          {insight.summary_md}
          <div className="text-[10px] text-muted-foreground mt-2 not-prose">
            Generated {new Date(insight.generated_at).toLocaleString()} · {insight.model}
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No insights yet. Generate one once the campaign has replies.</div>
      )}
    </div>
  );
}

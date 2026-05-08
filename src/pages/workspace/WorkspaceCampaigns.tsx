import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Megaphone, Rocket, Loader2, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { crmKeys, fetchCampaignBase } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const statusTone: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  running: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  completed: "bg-primary/15 text-primary border-primary/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
};

type RecipientRow = { id: string; status: string; sent_at: string | null; error_message: string | null; contact_phone: string };

const fetchRecipients = async (campaignId: string) => {
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("id, status, sent_at, error_message, contact_phone")
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as RecipientRow[];
};

export default function WorkspaceCampaigns({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: crmKeys.campaigns(workspaceId),
    queryFn: () => fetchCampaignBase(workspaceId),
  });
  const [openId, setOpenId] = useState<string | null>(null);

  const campaigns = data?.campaigns ?? [];
  const numbers = data?.numbers ?? [];
  const templates = data?.templates ?? [];

  const numberById = useMemo(() => new Map(numbers.map((n) => [n.id, n])), [numbers]);
  const templateById = useMemo(() => new Map(templates.map((t: any) => [t.id, t])), [templates]);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /><h1 className="font-display text-2xl font-bold">Campaigns</h1></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button asChild size="sm"><Link to={`/ws/${slug}/launch`}><Rocket className="w-4 h-4 mr-1.5" />New launch</Link></Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Campaign history and live monitoring. Create new campaigns from <Link to={`/ws/${slug}/launch`} className="text-primary underline">Launch</Link>.</p>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No campaigns yet.
          <div className="mt-3"><Button asChild size="sm"><Link to={`/ws/${slug}/launch`}>Launch first campaign</Link></Button></div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
          {campaigns.map((c: any) => {
            const number = numberById.get(c.whatsapp_number_id);
            const template = templateById.get(c.template_id);
            const total = c.total_recipients ?? 0;
            const sent = c.sent_count ?? 0;
            const failed = c.failed_count ?? 0;
            const open = openId === c.id;
            const tone = statusTone[c.status] ?? statusTone.draft;
            return (
              <div key={c.id}>
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setOpenId(open ? null : c.id)}
                >
                  {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {template?.name ?? "—"} · {number ? (number.label ?? `+${number.phone_number}`) : "—"} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <Stat label="Sent" value={`${sent}/${total}`} />
                    {failed > 0 && <Stat label="Failed" value={failed} tone="bad" />}
                  </div>
                  <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${tone}`}>{c.status}</Badge>
                </button>
                {open && <CampaignDetail campaignId={c.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-recipients", campaignId],
    queryFn: () => fetchRecipients(campaignId),
  });

  const stats = useMemo(() => {
    const r = data ?? [];
    return {
      total: r.length,
      sent: r.filter((x) => x.sent_at).length,
      delivered: r.filter((x) => x.delivered_at).length,
      read: r.filter((x) => x.read_at).length,
      replied: r.filter((x) => x.replied_at).length,
      failed: r.filter((x) => x.status === "failed").length,
    };
  }, [data]);

  if (isLoading) return <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>;

  return (
    <div className="px-4 pb-4 pt-2 bg-background/40">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Sent" value={stats.sent} />
        <Stat label="Delivered" value={stats.delivered} />
        <Stat label="Read" value={stats.read} />
        <Stat label="Replied" value={stats.replied} tone="good" />
        <Stat label="Failed" value={stats.failed} tone={stats.failed > 0 ? "bad" : undefined} />
      </div>
      {(data ?? []).length > 0 && (
        <div className="rounded-md border border-border bg-card/30 max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0"><tr className="text-left text-muted-foreground">
              <th className="px-2 py-1.5">Phone</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Sent</th><th className="px-2 py-1.5">Delivered</th><th className="px-2 py-1.5">Read</th><th className="px-2 py-1.5">Replied</th><th className="px-2 py-1.5">Error</th>
            </tr></thead>
            <tbody>
              {(data ?? []).slice(0, 200).map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-2 py-1 font-mono">{r.contact_phone}</td>
                  <td className="px-2 py-1 capitalize">{r.status}</td>
                  <td className="px-2 py-1">{r.sent_at ? "✓" : "—"}</td>
                  <td className="px-2 py-1">{r.delivered_at ? "✓" : "—"}</td>
                  <td className="px-2 py-1">{r.read_at ? "✓" : "—"}</td>
                  <td className="px-2 py-1">{r.replied_at ? "✓" : "—"}</td>
                  <td className="px-2 py-1 text-red-600 truncate max-w-[200px]">{r.failed_reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "bad" }) => (
  <div className="rounded-md border border-border bg-card/30 px-2 py-1.5">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-medium ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
  </div>
);

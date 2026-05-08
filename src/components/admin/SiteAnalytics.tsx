import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Eye, Users, Clock, MousePointerClick } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Row = {
  session_id: string;
  form_type: string;
  event_type: string;
  step_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const fetchSiteAnalytics = async () => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("form_analytics")
    .select("session_id, form_type, event_type, step_name, metadata, created_at")
    .like("form_type", "page:%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as Row[];
};

export const SiteAnalytics = () => {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-site-analytics"],
    queryFn: fetchSiteAnalytics,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // aggregate
  const sessions = new Set<string>();
  const pageViews = new Map<string, { views: number; sessions: Set<string> }>();
  const clicksByLabel = new Map<string, number>();
  const timeSecondsBySession = new Map<string, number>();
  const depthBySession = new Map<string, number>();
  let totalViews = 0;

  for (const r of rows) {
    sessions.add(r.session_id);
    const page = r.form_type.replace(/^page:/, "");
    if (r.event_type === "page_view") {
      const cur = pageViews.get(page) ?? { views: 0, sessions: new Set() };
      cur.views += 1;
      cur.sessions.add(r.session_id);
      pageViews.set(page, cur);
      totalViews += 1;
    } else if (r.event_type === "click") {
      const label = String((r.metadata as { label?: string } | null)?.label ?? "—").slice(0, 60);
      clicksByLabel.set(label, (clicksByLabel.get(label) ?? 0) + 1);
    } else if (r.event_type === "time_on_page") {
      const sec = Number((r.metadata as { seconds?: number } | null)?.seconds ?? 0);
      timeSecondsBySession.set(r.session_id, Math.max(timeSecondsBySession.get(r.session_id) ?? 0, sec));
    } else if (r.event_type === "scroll_depth") {
      const d = Number((r.metadata as { depth?: number } | null)?.depth ?? 0);
      depthBySession.set(r.session_id, Math.max(depthBySession.get(r.session_id) ?? 0, d));
    }
  }

  const topPages = Array.from(pageViews.entries())
    .map(([page, v]) => ({ page, views: v.views, uniques: v.sessions.size }))
    .sort((a, b) => b.views - a.views).slice(0, 12);
  const topClicks = Array.from(clicksByLabel.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);
  const avgTime = timeSecondsBySession.size
    ? Math.round([...timeSecondsBySession.values()].reduce((a, b) => a + b, 0) / timeSecondsBySession.size)
    : 0;
  const avgDepth = depthBySession.size
    ? Math.round([...depthBySession.values()].reduce((a, b) => a + b, 0) / depthBySession.size)
    : 0;

  const lastEventAt = rows[0]?.created_at;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-display font-bold">Site analytics</h2>
        <p className="text-sm text-muted-foreground">
          Page views, sessions, engagement - last 30 days{lastEventAt ? ` · updated ${formatDistanceToNow(new Date(lastEventAt), { addSuffix: true })}` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Eye} label="Page views" value={totalViews} />
        <Kpi icon={Users} label="Sessions" value={sessions.size} />
        <Kpi icon={Clock} label="Avg time on page" value={avgTime ? `${avgTime}s` : "—"} />
        <Kpi icon={MousePointerClick} label="Avg scroll depth" value={avgDepth ? `${avgDepth}%` : "—"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Top pages" empty={topPages.length === 0}>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="text-left font-medium pb-2">Page</th><th className="text-right font-medium pb-2">Views</th><th className="text-right font-medium pb-2">Uniques</th></tr>
            </thead>
            <tbody>
              {topPages.map((p) => (
                <tr key={p.page} className="border-t border-border/50">
                  <td className="py-2 truncate max-w-[260px]">{p.page}</td>
                  <td className="py-2 text-right font-mono">{p.views}</td>
                  <td className="py-2 text-right font-mono text-muted-foreground">{p.uniques}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Top clicks" empty={topClicks.length === 0}>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="text-left font-medium pb-2">Label</th><th className="text-right font-medium pb-2">Clicks</th></tr>
            </thead>
            <tbody>
              {topClicks.map((c) => (
                <tr key={c.label} className="border-t border-border/50">
                  <td className="py-2 truncate max-w-[320px]">{c.label}</td>
                  <td className="py-2 text-right font-mono">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
};

const Kpi = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string }) => (
  <div className="rounded-lg border border-border bg-card/30 p-4">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
    <div className="text-2xl font-display font-semibold mt-1">{value}</div>
  </div>
);

const Panel = ({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) => (
  <div className="rounded-lg border border-border bg-card/30 p-5">
    <h3 className="font-display text-sm font-semibold mb-3">{title}</h3>
    {empty ? <p className="text-sm text-muted-foreground py-6 text-center">No data yet</p> : children}
  </div>
);

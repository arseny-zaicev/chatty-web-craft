import { Link, useOutletContext } from "react-router-dom";
import { BarChart3, Send, MessageSquare, Megaphone, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkspaceOverview, portfolioKeys } from "@/lib/portfolioMetrics";
import type { WorkspaceContext } from "./WorkspaceLayout";

export default function WorkspaceReporting() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const { data } = useQuery({
    queryKey: portfolioKeys.workspaceOverview(workspace?.id ?? ""),
    queryFn: () => fetchWorkspaceOverview(workspace!.id),
    enabled: Boolean(workspace),
  });

  if (!workspace) return null;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-1"><BarChart3 className="w-5 h-5 text-primary" /><h1 className="font-display text-2xl font-bold">Reporting</h1></div>
        <p className="text-sm text-muted-foreground">Daily activity for {workspace.name}. Deeper analytics coming soon.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Send} label="Delivered today" value={data?.delivered_today ?? 0} />
        <Stat icon={MessageSquare} label="Replies today" value={data?.replies_today ?? 0} />
        <Stat icon={Megaphone} label="Active campaigns" value={data?.active_campaigns ?? 0} />
        <Stat icon={MessageSquare} label="Unread inbox" value={data?.unread_replies ?? 0} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent campaigns</CardTitle></CardHeader>
        <CardContent>
          {(data?.recent_launches ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No campaigns yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {data!.recent_launches.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="text-muted-foreground">{c.sent_count}/{c.total} · {c.status}</span>
                </div>
              ))}
            </div>
          )}
          <div className="pt-3"><Button asChild size="sm" variant="outline"><Link to={`/ws/${workspace.slug}/campaigns`}>Open Campaigns</Link></Button></div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        <div className="font-medium text-foreground mb-1">Coming soon</div>
        Per-number performance, weekly trends, reply rate by template, booked-call attribution.
      </div>
    </div>
  );
}

const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: number }) => (
  <div className="rounded-lg border border-border bg-card/30 p-3">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
    <div className="text-2xl font-display font-semibold mt-1">{value}</div>
  </div>
);

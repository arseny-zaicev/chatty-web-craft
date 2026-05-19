import { Link, useOutletContext } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox, Megaphone, Rocket,
  Phone, FileText, MessageSquare, Send, Calendar, AlertTriangle, CheckCircle2, Clock, Loader2,
  Globe, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchWorkspaceOverview, portfolioKeys } from "@/lib/portfolioMetrics";
import { fetchCampaignSummaries } from "@/lib/launchData";
import { groupCampaigns, type CampaignRow } from "@/lib/campaigns";
import { tzInfo, dateKeyInTz, todayKeyInTz, shortDateInTz, timeInTz } from "@/lib/timezones";
import { useWorkspaceAccess } from "@/lib/workspaceRole";
import { LatestReportCard } from "@/components/workspace/LatestReportCard";
import { MessageIntegrityPanel } from "@/components/workspace/MessageIntegrityPanel";
import type { WorkspaceContext } from "./WorkspaceLayout";

const HEALTH = {
  running: { label: "Running", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  scheduled: { label: "Scheduled", cls: "bg-sky-500/10 text-sky-500 border-sky-500/30", icon: CheckCircle2 },
  idle: { label: "Ready", cls: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
  attention: { label: "Attention", cls: "bg-amber-500/10 text-amber-500 border-amber-500/30", icon: AlertTriangle },
  blocked: { label: "No active numbers", cls: "bg-red-500/10 text-red-500 border-red-500/30", icon: AlertTriangle },
} as const;

export default function WorkspaceOverview() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const { data: access } = useWorkspaceAccess(workspace?.id);
  const canManage = Boolean(access?.canManageSettings);
  const canLaunch = Boolean(access?.permissions?.perm_launch);
  const { data, isLoading } = useQuery({
    queryKey: portfolioKeys.workspaceOverview(workspace?.id ?? ""),
    queryFn: () => fetchWorkspaceOverview(workspace!.id),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const { data: campaignRows = [] } = useQuery({
    queryKey: ["campaigns", "summaries", workspace?.id ?? ""],
    queryFn: () => fetchCampaignSummaries(workspace!.id),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const activeGroup = useMemo(() => {
    const groups = groupCampaigns(campaignRows as CampaignRow[]);
    const active = groups.filter((g) => g.status === "running" || g.status === "scheduled" || g.status === "paused");
    return active[0] ?? null;
  }, [campaignRows]);

  if (!workspace) return <div className="p-6 text-sm text-muted-foreground">Pick a client.</div>;
  if (isLoading || !data) {
    return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  // "blocked / no active numbers" is an internal infra signal; hide from non-managers.
  const H = !canManage && data.health === "blocked" ? HEALTH.idle : HEALTH[data.health];
  const slug = workspace.slug;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: workspace.color }} />
            <h1 className="font-display text-2xl font-bold">{workspace.name}</h1>
            <Badge variant="outline" className={H.cls}><H.icon className="w-3 h-3 mr-1" />{H.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">/{slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link to={`/ws/${slug}/inbox`}><Inbox className="w-4 h-4 mr-1.5" />Open Inbox</Link></Button>
          {canLaunch && <Button asChild size="sm"><Link to={`/ws/${slug}/launch`}><Rocket className="w-4 h-4 mr-1.5" />Launch</Link></Button>}
        </div>
      </div>

      {/* KPI grid — clients see only the high-level metrics they actually need.
          Internal/operational KPIs (delivered today, numbers ready, approved templates)
          are kept in the manager view only. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={MessageSquare} label="Unread replies" value={data.unread_replies} accent={data.unread_replies > 0 ? "text-emerald-500" : undefined} />
        <Kpi icon={Megaphone} label="Active campaigns" value={data.active_campaigns} />
        {canManage && <Kpi icon={CheckCircle2} label="Delivered messages" value={data.delivered_today} />}
        <Kpi icon={MessageSquare} label="Replies today" value={data.replies_today} />
        {canManage && <Kpi icon={Phone} label="Numbers ready" value={`${data.numbers_ready}/${data.numbers_total}`} />}
      </div>

      <LatestReportCard workspaceId={workspace.id} slug={slug} />

      {activeGroup && <ActiveCampaignCard group={activeGroup} slug={slug} /> }

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent launches */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Rocket className="w-4 h-4" />Recent launches</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_launches.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No campaigns yet.
                {canLaunch ? (
                  <div className="mt-3"><Button asChild size="sm"><Link to={`/ws/${slug}/launch`}>Launch first campaign</Link></Button></div>
                ) : (
                  <div className="mt-3"><Button asChild size="sm" variant="outline"><Link to={`/ws/${slug}/inbox`}>Open Inbox</Link></Button></div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recent_launches.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">Total {c.total}</span>
                      <Badge variant="outline" className="capitalize text-xs">{c.status}</Badge>
                    </div>
                  </div>
                ))}
                <div className="pt-3"><Button asChild size="sm" variant="ghost"><Link to={`/ws/${slug}/campaigns`}>View all campaigns →</Link></Button></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status panel */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={Clock} label="Last activity" value={data.last_activity ? formatDistanceToNow(new Date(data.last_activity), { addSuffix: true }) : "—"} />
            <Row icon={Calendar} label="Next launch" value={data.next_launch ? new Date(data.next_launch).toLocaleString() : "—"} />
            {canManage && <Row icon={Phone} label="Numbers" value={`${data.numbers_ready} ready of ${data.numbers_total}`} />}
            {(() => {
              const infraIssue = data.numbers_total === 0 || (data.numbers_total > 0 && data.numbers_ready === 0);
              const inboxIssue = data.numbers_ready > 0 && data.unread_replies > 20;
              const showAttention = canManage ? (data.health === "blocked" || data.health === "attention") : inboxIssue;
              if (!showAttention) return null;
              return (
                <div className={`rounded-md border p-2.5 text-xs ${H.cls}`}>
                  <div className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Needs attention</div>
                  <div className="opacity-80 mt-0.5">
                    {canManage && infraIssue && data.numbers_total === 0 && "Add a WhatsApp number in Settings."}
                    {canManage && infraIssue && data.numbers_total > 0 && data.numbers_ready === 0 && "No numbers are ready. Check Settings → Numbers."}
                    {inboxIssue && (canManage && infraIssue ? " " : "") + "Inbox has many unread replies."}
                  </div>
                  {canManage && infraIssue && (
                    <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs"><Link to={`/ws/${slug}/settings`}>Open Settings</Link></Button>
                  )}
                  {inboxIssue && (
                    <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs ml-2"><Link to={`/ws/${slug}/inbox`}>Open Inbox</Link></Button>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      {canManage && (
        <>
          <MessageIntegrityPanel workspaceId={workspace.id} />
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Resources</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /><span>Website, booking link and offer summary live in <Link to={`/ws/${slug}/library`} className="text-primary underline">Library</Link>.</span><ExternalLink className="w-3.5 h-3.5" /></div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const Kpi = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number | string; accent?: string }) => (
  <div className="rounded-lg border border-border bg-card/30 p-3">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
    <div className={`text-2xl font-display font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
  </div>
);

const Row = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2 text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
    <div className="text-right truncate">{value}</div>
  </div>
);

function ActiveCampaignCard({ group, slug }: { group: ReturnType<typeof groupCampaigns>[number]; slug: string }) {
  const tz = tzInfo(group.recipientCountry).tz;
  const tzLabel = tzInfo(group.recipientCountry).label;
  const dates = group.scheduledDates;
  const fmt = (d: string) => shortDateInTz(`${d}T12:00:00Z`, "UTC");
  const range = dates.length
    ? (dates[0] === dates[dates.length - 1] ? fmt(dates[0]) : `${fmt(dates[0])} - ${fmt(dates[dates.length - 1])}`)
    : (group.firstScheduledAt ? shortDateInTz(group.firstScheduledAt, tz) : null);
  const pct = group.total > 0 ? Math.min(100, Math.round((group.sent / group.total) * 100)) : 0;
  const todayLabel = (() => {
    if (group.today <= 0) return null;
    if (group.firstScheduledAt && dateKeyInTz(group.firstScheduledAt, tz) === todayKeyInTz(tz)) {
      return `Today ${group.today.toLocaleString()} @ ${timeInTz(group.firstScheduledAt, tz)} ${tzLabel}`;
    }
    return `Today ${group.today.toLocaleString()}`;
  })();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" />
          Active campaign
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-medium truncate">{group.displayName}</div>
            <div className="text-xs text-muted-foreground truncate">
              {[`Total ${group.total.toLocaleString()}`, dates.length ? `${dates.length} ${dates.length === 1 ? "day" : "days"}` : null, range, todayLabel].filter(Boolean).join(" · ")}
            </div>
          </div>
          <Badge variant="outline" className="capitalize text-xs shrink-0">{group.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{pct}% processed</span>
        </div>
        <div>
          <Button asChild size="sm" variant="ghost" className="px-0">
            <Link to={`/ws/${slug}/campaigns?open=${encodeURIComponent(group.key)}`}>Open campaign →</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

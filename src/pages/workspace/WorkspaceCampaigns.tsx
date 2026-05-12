import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Megaphone, Rocket, Loader2, ChevronRight, ChevronDown, RefreshCw, Pause, Play, X, SkipForward, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCampaignSummaries } from "@/lib/launchData";
import { friendlySenderLabel } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceRole, isManagerLike, isAdmin } from "@/lib/workspaceRole";
import { groupCampaigns, type CampaignRow, type CampaignGroup } from "@/lib/campaigns";
import { CampaignReportPanel } from "@/components/workspace/CampaignReportPanel";
import { tzInfo, dateKeyInTz, todayKeyInTz, shortDateInTz, timeInTz } from "@/lib/timezones";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  running: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  completed: "bg-primary/15 text-primary border-primary/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
};

type RecipientLite = { id: string; status: string; scheduled_at: string | null; sent_at: string | null; campaign_id: string; whatsapp_number_id: string | null };
type RecipientFull = { id: string; status: string; sent_at: string | null; error_message: string | null; contact_phone: string; campaign_id: string };

// Page through every recipient (no 500 cap) — only the small projection we need for stats.
async function fetchRecipientsLite(campaignIds: string[]): Promise<RecipientLite[]> {
  const out: RecipientLite[] = [];
  const PAGE = 1000;
  for (const id of campaignIds) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("id, status, scheduled_at, sent_at, whatsapp_number_id")
        .eq("campaign_id", id)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Omit<RecipientLite, "campaign_id">[];
      rows.forEach((r) => out.push({ ...r, campaign_id: id }));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  return out;
}

async function fetchRecipientsFull(campaignIds: string[]): Promise<RecipientFull[]> {
  const out: RecipientFull[] = [];
  const PAGE = 1000;
  for (const id of campaignIds) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("id, status, sent_at, error_message, contact_phone")
        .eq("campaign_id", id)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as Omit<RecipientFull, "campaign_id">[];
      rows.forEach((r) => out.push({ ...r, campaign_id: id }));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  return out;
}

const fetchCampaignMeta = async (numberIds: string[], templateIds: string[]) => {
  const numbers = new Map<string, { id: string; phone_number: string; label: string | null }>();
  const templates = new Map<string, { id: string; name: string }>();
  if (numberIds.length > 0) {
    const { data } = await supabase.from("whatsapp_numbers").select("id, phone_number, label, display_name").in("id", numberIds);
    (data ?? []).forEach((n: any) => numbers.set(n.id, n));
  }
  if (templateIds.length > 0) {
    const { data } = await supabase.from("message_templates").select("id, name").in("id", templateIds);
    (data ?? []).forEach((t: any) => templates.set(t.id, t));
  }
  return { numbers, templates };
};

function dateRangeLabel(group: CampaignGroup): { range: string; days: number } | null {
  const dates = group.scheduledDates;
  if (!dates || dates.length === 0) {
    if (group.firstScheduledAt) {
      const tz = tzInfo(group.recipientCountry).tz;
      return { range: shortDateInTz(group.firstScheduledAt, tz), days: 1 };
    }
    return null;
  }
  const tz = tzInfo(group.recipientCountry).tz;
  const first = dates[0];
  const last = dates[dates.length - 1];
  const fmt = (d: string) => shortDateInTz(`${d}T12:00:00Z`, "UTC");
  const range = first === last ? fmt(first) : `${fmt(first)} - ${fmt(last)}`;
  return { range, days: dates.length };
}

function headerSubtitle(group: CampaignGroup): string {
  const parts: string[] = [`Total ${group.total.toLocaleString()}`];
  const dr = dateRangeLabel(group);
  if (dr) {
    parts.push(`${dr.days} ${dr.days === 1 ? "day" : "days"}`);
    parts.push(dr.range);
  }
  if (group.today > 0) {
    const tz = tzInfo(group.recipientCountry).tz;
    if (group.firstScheduledAt && dateKeyInTz(group.firstScheduledAt, tz) === todayKeyInTz(tz)) {
      parts.push(`today ${group.today.toLocaleString()} @ ${timeInTz(group.firstScheduledAt, tz)}`);
    } else {
      parts.push(`today ${group.today.toLocaleString()}`);
    }
  }
  return parts.join(" · ");
}

function ProgressBar({ value, total, className = "" }: { value: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={`h-1.5 rounded-full bg-muted overflow-hidden ${className}`}>
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function WorkspaceCampaigns({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { data: campaigns = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["campaigns", "summaries", workspaceId],
    queryFn: () => fetchCampaignSummaries(workspaceId),
    staleTime: 30_000,
  });
  const { data: role } = useWorkspaceRole(workspaceId);
  const canManage = isManagerLike(role);
  const canLaunch = isAdmin(role);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const o = searchParams.get("open");
    if (o) {
      setOpenKey(o);
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numberIds = useMemo(() => Array.from(new Set(campaigns.map((c: any) => c.whatsapp_number_id).filter(Boolean))) as string[], [campaigns]);
  const templateIds = useMemo(() => Array.from(new Set(campaigns.map((c: any) => c.template_id).filter(Boolean))) as string[], [campaigns]);
  const { data: meta } = useQuery({
    queryKey: ["campaigns", "meta", workspaceId, numberIds.join(","), templateIds.join(",")],
    queryFn: () => fetchCampaignMeta(numberIds, templateIds),
    enabled: campaigns.length > 0,
    staleTime: 60_000,
  });
  const numberById = meta?.numbers ?? new Map();
  const templateById = meta?.templates ?? new Map();

  const groups = useMemo(() => groupCampaigns(campaigns as CampaignRow[]), [campaigns]);

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /><h1 className="font-display text-2xl font-bold">Campaigns</h1></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
          {canLaunch && (
            <Button asChild size="sm"><Link to={`/ws/${slug}/launch`}><Rocket className="w-4 h-4 mr-1.5" />New launch</Link></Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Campaign history and live monitoring.
        {canLaunch && <> Create new campaigns from <Link to={`/ws/${slug}/launch`} className="text-primary underline">Launch</Link>.</>}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No campaigns yet.
          {canLaunch && <div className="mt-3"><Button asChild size="sm"><Link to={`/ws/${slug}/launch`}>Launch first campaign</Link></Button></div>}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
          {groups.map((g) => {
            const template = templateById.get(g.template_id ?? "");
            const numberLabel = g.whatsapp_number_ids.length === 1
              ? (() => { const n = numberById.get(g.whatsapp_number_ids[0]); return n ? friendlySenderLabel(n) : null; })()
              : (canManage ? `${g.whatsapp_number_ids.length} numbers` : null);
            const open = openKey === g.key;
            const tone = statusTone[g.status] ?? statusTone.draft;
            return (
              <div key={g.key}>
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setOpenKey(open ? null : g.key)}
                >
                  {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">{g.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {headerSubtitle(g)}
                    </div>
                    {canManage && (
                      <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                        {[template?.name, numberLabel, formatDistanceToNow(new Date(g.created_at), { addSuffix: true })].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div className="md:hidden mt-2 flex items-center gap-2">
                      <ProgressBar value={g.sent} total={g.total} className="flex-1" />
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{g.sent.toLocaleString()}/{g.total.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-3 shrink-0 w-[180px]">
                    <ProgressBar value={g.sent} total={g.total} className="flex-1" />
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-[80px] text-right">{g.sent.toLocaleString()}/{g.total.toLocaleString()}</span>
                  </div>
                  {g.failed > 0 && <span className="text-[11px] text-red-600 shrink-0 hidden sm:inline">{g.failed} failed</span>}
                  <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${tone}`}>{g.status}</Badge>
                </button>
                {open && (
                  <CampaignDetail
                    group={g}
                    canManage={canManage}
                    numberById={numberById}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type DayBucket = { date: string; firstScheduledAt: string | null; scheduled: number; sent: number; failed: number };

function buildDayBuckets(rows: RecipientLite[], tz: string): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const r of rows) {
    const ref = r.scheduled_at ?? r.sent_at;
    if (!ref) continue;
    const key = dateKeyInTz(ref, tz);
    let b = map.get(key);
    if (!b) {
      b = { date: key, firstScheduledAt: null, scheduled: 0, sent: 0, failed: 0 };
      map.set(key, b);
    }
    b.scheduled += 1;
    if (r.status === "failed") b.failed += 1;
    if (r.sent_at && r.status !== "failed") b.sent += 1;
    if (r.scheduled_at) {
      if (!b.firstScheduledAt || r.scheduled_at < b.firstScheduledAt) b.firstScheduledAt = r.scheduled_at;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function CampaignDetail({
  group,
  canManage,
  numberById,
}: {
  group: CampaignGroup;
  canManage: boolean;
  numberById: Map<string, { id: string; phone_number: string; label: string | null; display_name: string | null }>;
}) {
  const campaignIds = group.campaigns.map((c) => c.id);
  const tz = tzInfo(group.recipientCountry).tz;
  const tzLabel = tzInfo(group.recipientCountry).label;
  const [showRecipients, setShowRecipients] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();

  const callAction = async (
    action: "pause" | "resume" | "cancel" | "redistribute" | "retry_failed",
    extra?: Record<string, unknown>,
  ) => {
    setBusy(action);
    try {
      if (action === "retry_failed") {
        // Retry takes a single campaign_id; loop over the group.
        let total = 0;
        for (const id of campaignIds) {
          const { data, error } = await supabase.functions.invoke("campaigns", {
            body: { action, campaign_id: id, ...extra },
          });
          if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error || "Failed");
          total += Number((data as any)?.retried ?? 0);
        }
        toast.success(`Re-queued ${total} failed recipient${total === 1 ? "" : "s"}`);
      } else {
        const { data, error } = await supabase.functions.invoke("campaigns", {
          body: { action, campaign_ids: campaignIds, ...extra },
        });
        if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error || "Failed");
        const verbs: Record<string, string> = {
          pause: "Paused", resume: "Resumed", cancel: "Cancelled", redistribute: "Re-balanced",
        };
        toast.success(`${verbs[action]} ${campaignIds.length > 1 ? `${campaignIds.length} campaigns` : "campaign"}`);
      }
      qc.invalidateQueries({ queryKey: ["campaigns", "summaries"] });
      qc.invalidateQueries({ queryKey: ["campaign-recipients-lite", group.key] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const { data: liteRows, isLoading: liteLoading } = useQuery({
    queryKey: ["campaign-recipients-lite", group.key, campaignIds.join(",")],
    queryFn: () => fetchRecipientsLite(campaignIds),
  });

  const { data: fullRows, isLoading: fullLoading } = useQuery({
    queryKey: ["campaign-recipients-full", group.key, campaignIds.join(",")],
    queryFn: () => fetchRecipientsFull(campaignIds),
    enabled: showRecipients,
  });

  const days = useMemo(() => buildDayBuckets(liteRows ?? [], tz), [liteRows, tz]);
  const todayKey = todayKeyInTz(tz);
  const visibleDays = useMemo(() => {
    if (showAllDays) return days;
    // Show today + future + last completed day before today
    const future = days.filter((d) => d.date >= todayKey);
    const past = days.filter((d) => d.date < todayKey);
    const lastPast = past.length ? [past[past.length - 1]] : [];
    return [...lastPast, ...future];
  }, [days, todayKey, showAllDays]);
  const hiddenCount = days.length - visibleDays.length;

  // Authoritative totals from campaigns rows (not capped recipient query).
  const totals = {
    total: group.total,
    sent: group.sent,
    failed: group.failed,
    pending: Math.max(0, group.total - group.sent - group.failed),
    today: group.today,
  };

  const numberLabelFor = (campaignId: string) => {
    const c = group.campaigns.find((x) => x.id === campaignId);
    if (!c?.whatsapp_number_id) return "—";
    const n = numberById.get(c.whatsapp_number_id);
    return n ? friendlySenderLabel(n) : "—";
  };

  const isActive = group.status === "running" || group.status === "scheduled";
  const isPaused = group.status === "paused";
  const isTerminal = group.status === "completed" || group.status === "cancelled" || group.status === "failed";

  return (
    <div className="px-4 pb-4 pt-2 bg-background/40">
      {canManage && !isTerminal && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {isActive && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => callAction("pause")}>
              {busy === "pause" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1.5" />}
              Pause
            </Button>
          )}
          {isPaused && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => callAction("resume")}>
              {busy === "resume" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
              Resume
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => callAction("redistribute")}>
            {busy === "redistribute" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5 mr-1.5" />}
            Re-balance
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            disabled={busy !== null}
            onClick={() => {
              if (confirm("Cancel this campaign? Pending sends will stop.")) callAction("cancel");
            }}
          >
            {busy === "cancel" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
            Cancel
          </Button>
        </div>
      )}
      {canManage && totals.failed > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => {
              if (confirm(`Re-queue ${totals.failed} failed recipient${totals.failed === 1 ? "" : "s"} using this campaign's pacing rules?`)) {
                callAction("retry_failed");
              }
            }}
          >
            {busy === "retry_failed" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5 mr-1.5" />}
            Retry {totals.failed} failed
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <Stat label="Total" value={totals.total.toLocaleString()} />
        <Stat label="Sent" value={totals.sent.toLocaleString()} tone="good" />
        <Stat label="Pending" value={totals.pending.toLocaleString()} />
        <Stat label="Failed" value={totals.failed.toLocaleString()} tone={totals.failed > 0 ? "bad" : undefined} />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <ProgressBar value={totals.sent} total={totals.total} className="flex-1" />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {totals.total > 0 ? Math.round((totals.sent / totals.total) * 100) : 0}%
        </span>
      </div>

      {/* Per-day breakdown */}
      <div className="rounded-md border border-border bg-card/30 mb-3">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day-by-day · {tzLabel}</div>
          {hiddenCount > 0 && (
            <button className="text-[11px] text-primary hover:underline" onClick={() => setShowAllDays(true)}>
              Show {hiddenCount} earlier {hiddenCount === 1 ? "day" : "days"}
            </button>
          )}
          {showAllDays && days.length > visibleDays.length + 0 && (
            <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => setShowAllDays(false)}>Collapse</button>
          )}
        </div>
        {liteLoading ? (
          <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>
        ) : visibleDays.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">No scheduled recipients yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Window start</th>
                <th className="px-3 py-1.5 font-medium text-right">Scheduled</th>
                <th className="px-3 py-1.5 font-medium text-right">Sent</th>
                <th className="px-3 py-1.5 font-medium text-right">Failed</th>
                {canManage && !isTerminal && <th className="px-3 py-1.5 font-medium text-right w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((d) => {
                const isToday = d.date === todayKey;
                const isFuture = d.date > todayKey;
                const canSkip = canManage && !isTerminal && (isToday || isFuture) && d.scheduled > d.sent + d.failed;
                return (
                  <tr key={d.date} className={`border-t border-border/60 ${isToday ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-1.5">
                      {shortDateInTz(`${d.date}T12:00:00Z`, "UTC")}
                      {isToday && <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">today</span>}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">{d.firstScheduledAt ? timeInTz(d.firstScheduledAt, tz) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{d.scheduled.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{d.sent.toLocaleString()}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${d.failed > 0 ? "text-red-600" : ""}`}>{d.failed.toLocaleString()}</td>
                    {canManage && !isTerminal && (
                      <td className="px-2 py-1 text-right">
                        {canSkip && (
                          <button
                            className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                            disabled={busy !== null}
                            onClick={() => {
                              if (confirm(`Skip ${d.date}? Pending sends move to the next available day.`))
                                callAction("redistribute", { skip_dates: [d.date] });
                            }}
                          >
                            <SkipForward className="w-3 h-3" />Skip
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Per-number breakdown — derived from recipients (works for single or multi-campaign groups) */}
      {canManage && (() => {
        const byNum = new Map<string, { total: number; sent: number; failed: number; pending: number }>();
        for (const r of liteRows ?? []) {
          const key = r.whatsapp_number_id || "—";
          const cur = byNum.get(key) ?? { total: 0, sent: 0, failed: 0, pending: 0 };
          cur.total++;
          if (r.status === "sent" || r.sent_at) cur.sent++;
          else if (r.status === "failed") cur.failed++;
          else cur.pending++;
          byNum.set(key, cur);
        }
        const entries = Array.from(byNum.entries());
        if (entries.length < 2) return null;
        return (
          <div className="mb-3 rounded-md border border-border bg-card/30 p-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Per number ({entries.length})</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {entries.map(([numId, s]) => {
                const label = numId !== "—" && numberById.get(numId) ? friendlySenderLabel(numberById.get(numId)!) : "—";
                const parts = [`${s.sent} sent`];
                if (s.failed > 0) parts.push(`${s.failed} failed`);
                if (s.pending > 0) parts.push(`${s.pending} pending`);
                return (
                  <div key={numId} className="flex items-center justify-between text-xs gap-3">
                    <span className="truncate">{label}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {parts.join(" · ")} <span className="opacity-60">/ {s.total}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Recipients list — collapsed by default */}
      <div className="rounded-md border border-border bg-card/30 mb-3">
        <button
          className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium hover:bg-muted/20 transition-colors"
          onClick={() => setShowRecipients((v) => !v)}
        >
          <span>{showRecipients ? "Hide" : "Show"} recipients ({totals.total.toLocaleString()})</span>
          {showRecipients ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {showRecipients && (
          <div className="border-t border-border">
            {fullLoading ? (
              <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>
            ) : (fullRows ?? []).length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">No recipients.</div>
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5">Phone</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Sent at</th>
                      {canManage && <th className="px-2 py-1.5">Number</th>}
                      <th className="px-2 py-1.5">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fullRows ?? []).slice(0, 500).map((r) => (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-2 py-1 font-mono">{r.contact_phone}</td>
                        <td className="px-2 py-1 capitalize">{r.status}</td>
                        <td className="px-2 py-1">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                        {canManage && <td className="px-2 py-1 text-muted-foreground">{numberLabelFor(r.campaign_id)}</td>}
                        <td className="px-2 py-1 text-red-600 truncate max-w-[260px]">{r.error_message ?? ""}</td>
                      </tr>
                    ))}
                    {(fullRows ?? []).length > 500 && (
                      <tr><td colSpan={canManage ? 5 : 4} className="px-2 py-2 text-center text-muted-foreground">Showing first 500 of {fullRows!.length.toLocaleString()}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <CampaignReportPanel
        campaignIds={campaignIds}
        primaryCampaignId={campaignIds[0]}
        campaignName={group.displayName}
      />
    </div>
  );
}

const Stat = ({ label, value, tone, subtitle }: { label: string; value: number | string; tone?: "good" | "bad"; subtitle?: string }) => (
  <div className="rounded-md border border-border bg-card/30 px-2 py-1.5 min-w-0">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-medium truncate ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
    {subtitle && <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>}
  </div>
);

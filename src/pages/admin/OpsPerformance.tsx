import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Loader2, Users, Clock, AlertTriangle, MessageSquare, CheckCircle2, CalendarCheck, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { evaluateAdminAccess } from "@/lib/adminGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IskraLoader } from "@/components/IskraLoader";
import {
  fetchOperatorPerformance,
  fetchOperatorConversations,
  formatDurationSeconds,
  statusFor,
  type OperatorRow,
  type WindowKey,
} from "@/lib/opsPerformance";

const toneClass: Record<"ok" | "warn" | "crit" | "idle", string> = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  crit: "bg-red-100 text-red-800 border-red-200",
  idle: "bg-muted text-muted-foreground",
};

function Tile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function OpsPerformance() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [win, setWin] = useState<WindowKey>("today");
  const [openOp, setOpenOp] = useState<OperatorRow | null>(null);

  useEffect(() => {
    let mounted = true;
    evaluateAdminAccess().then((r) => {
      if (!mounted) return;
      if (r.state === "redirect") navigate(r.to, { replace: true });
      else setAuthReady(true);
    });
    return () => { mounted = false; };
  }, [navigate]);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-operator-performance", win],
    queryFn: () => fetchOperatorPerformance(win),
    enabled: authReady,
    refetchInterval: 60_000,
  });

  const totals = useMemo(() => {
    const t = { assigned: 0, unread: 0, waiting: 0, overdue: 0, positive: 0, meetings: 0 };
    const firstResponses: number[] = [];
    for (const r of rows) {
      t.assigned += r.assigned_now;
      t.unread += r.unread_now;
      t.waiting += r.waiting_now;
      t.overdue += r.overdue_now;
      t.positive += r.positive_replies_window;
      t.meetings += r.meetings_now;
      if (r.median_first_response_seconds != null) firstResponses.push(Number(r.median_first_response_seconds));
    }
    firstResponses.sort((a, b) => a - b);
    const median = firstResponses.length ? firstResponses[Math.floor(firstResponses.length / 2)] : null;
    return { ...t, medianFirst: median };
  }, [rows]);

  if (!authReady) return <IskraLoader />;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Team Performance</h1>
              <p className="text-xs text-muted-foreground">Internal operator dashboard - ownership, response speed, outcomes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup type="single" size="sm" value={win} onValueChange={(v) => v && setWin(v as WindowKey)}>
              <ToggleGroupItem value="today">Today</ToggleGroupItem>
              <ToggleGroupItem value="7d">7d</ToggleGroupItem>
              <ToggleGroupItem value="30d">30d</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Team strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Tile icon={<Users className="h-3.5 w-3.5" />} label="Assigned now" value={totals.assigned} />
          <Tile icon={<Inbox className="h-3.5 w-3.5" />} label="Unread now" value={totals.unread} />
          <Tile icon={<MessageSquare className="h-3.5 w-3.5" />} label="Waiting" value={totals.waiting} />
          <Tile icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Overdue (>2h)" value={totals.overdue} />
          <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Median first reply" value={formatDurationSeconds(totals.medianFirst)} />
          <Tile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={`Positive (${win})`} value={totals.positive} />
          <Tile icon={<CalendarCheck className="h-3.5 w-3.5" />} label="Meetings" value={totals.meetings} />
        </div>

        {/* Operator table */}
        <Card>
          <CardHeader>
            <CardTitle>Operators</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading
              </div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No operators yet</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operator</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Active 7d</TableHead>
                      <TableHead className="text-right">Unread</TableHead>
                      <TableHead className="text-right">Waiting</TableHead>
                      <TableHead className="text-right">Overdue</TableHead>
                      <TableHead className="text-right">Median 1st reply</TableHead>
                      <TableHead className="text-right">Median reply</TableHead>
                      <TableHead className="text-right">Replies ({win})</TableHead>
                      <TableHead className="text-right">Positive ({win})</TableHead>
                      <TableHead className="text-right">Meetings</TableHead>
                      <TableHead>Oldest waiting</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.user_id} className="cursor-pointer" onClick={() => setOpenOp(r)}>
                        <TableCell>
                          <div className="font-medium">{r.full_name || r.email || r.user_id.slice(0, 8)}</div>
                          {r.full_name && r.email ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.assigned_now}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.active_now}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.unread_now}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.waiting_now}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.overdue_now > 0 ? <Badge className={toneClass.crit}>{r.overdue_now}</Badge> : 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatDurationSeconds(r.median_first_response_seconds)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatDurationSeconds(r.median_response_seconds)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.human_replies_window}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.positive_replies_window}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.meetings_now}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.oldest_waiting_at ? formatDistanceToNow(new Date(r.oldest_waiting_at), { addSuffix: true }) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <OperatorDrilldown op={openOp} onClose={() => setOpenOp(null)} />
    </div>
  );
}

function OperatorDrilldown({ op, onClose }: { op: OperatorRow | null; onClose: () => void }) {
  const { data: convs = [], isLoading } = useQuery({
    queryKey: ["ops-operator-convs", op?.user_id],
    queryFn: () => fetchOperatorConversations(op!.user_id),
    enabled: !!op,
  });

  return (
    <Sheet open={!!op} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        {op ? (
          <>
            <SheetHeader>
              <SheetTitle>{op.full_name || op.email}</SheetTitle>
              <SheetDescription>Assigned chats and current state</SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-2 mt-4 mb-4">
              <Tile icon={<Users className="h-3.5 w-3.5" />} label="Assigned" value={op.assigned_now} />
              <Tile icon={<MessageSquare className="h-3.5 w-3.5" />} label="Waiting" value={op.waiting_now} />
              <Tile icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Overdue" value={op.overdue_now} />
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading</div>
            ) : convs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No assigned chats</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace / Pipeline</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Last inbound</TableHead>
                    <TableHead>Last reply</TableHead>
                    <TableHead>Waiting</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convs.map((c) => {
                    const s = statusFor(c);
                    const slug = c.workspace_slug;
                    const href = slug ? `/ws/${slug}/inbox?conversation=${c.conversation_id}` : "#";
                    return (
                      <TableRow key={c.conversation_id}>
                        <TableCell>
                          <div className="text-sm font-medium">{c.workspace_name || "-"}</div>
                          <div className="text-xs text-muted-foreground">{c.pipeline_name || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <Link to={href} className="text-sm hover:underline">
                            {c.contact_name || c.contact_phone || "-"}
                          </Link>
                          {c.unread_count > 0 ? <Badge className="ml-2" variant="secondary">{c.unread_count}</Badge> : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.last_inbound_at ? formatDistanceToNow(new Date(c.last_inbound_at), { addSuffix: true }) : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.last_human_reply_at ? formatDistanceToNow(new Date(c.last_human_reply_at), { addSuffix: true }) : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.waiting_since ? formatDistanceToNow(new Date(c.waiting_since), { addSuffix: true }) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={toneClass[s.tone]}>{s.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

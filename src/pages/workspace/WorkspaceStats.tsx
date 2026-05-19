import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { BarChart3, Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchSetterPerformance, setterKeys, fetchSetters } from "@/lib/setters";
import { fetchPipelines, pipelinesKey } from "@/lib/pipelines";
import { useRequireAuth } from "@/hooks/useAuthSession";
import { useWorkspaceAccess } from "@/lib/workspaceRole";
import type { WorkspaceContext } from "./WorkspaceLayout";

type Range = "24h" | "7d" | "30d";

const RANGE_DAYS: Record<Range, number> = { "24h": 1, "7d": 7, "30d": 30 };

const fmtSeconds = (s: number | null | undefined) => {
  if (s == null || !isFinite(s) || s < 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
};

export default function WorkspaceStats() {
  const { workspace } = useOutletContext<WorkspaceContext>();
  const userId = useRequireAuth();
  const { data: access } = useWorkspaceAccess(workspace?.id);
  const canViewAll = Boolean(access?.canManageSettings || access?.isAdmin || access?.isOwner);

  const [range, setRange] = useState<Range>("7d");
  const [pipelineId, setPipelineId] = useState<string>("all");
  const [scope, setScope] = useState<"team" | "me">(canViewAll ? "team" : "me");

  const { from, to } = useMemo(() => {
    const to = new Date();
    const from = new Date(Date.now() - RANGE_DAYS[range] * 86400 * 1000);
    return { from, to };
  }, [range]);

  const { data: setters = [] } = useQuery({
    queryKey: setterKeys.list(workspace?.id),
    queryFn: () => fetchSetters(workspace?.id),
    enabled: !!workspace?.id,
  });

  const mySetterId = useMemo(
    () => (userId ? setters.find((s) => s.linked_user_id === userId)?.id ?? null : null),
    [setters, userId],
  );

  const setterIdForRpc = scope === "me" ? mySetterId : null;

  const { data: pipelines = [] } = useQuery({
    queryKey: pipelinesKey(workspace?.id),
    queryFn: () => fetchPipelines(workspace?.id),
    enabled: !!workspace?.id,
  });

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: setterKeys.perf(workspace?.id, from.toISOString(), to.toISOString(), pipelineId, setterIdForRpc),
    enabled: !!workspace?.id && (scope === "team" ? canViewAll : Boolean(mySetterId)),
    queryFn: () => fetchSetterPerformance({
      workspaceId: workspace!.id,
      from, to,
      pipelineId: pipelineId === "all" ? null : pipelineId,
      setterId: setterIdForRpc,
    }),
  });

  if (!workspace) return null;

  const totals = rows.reduce(
    (acc, r) => {
      acc.active += r.active_chats;
      acc.booked += r.conv_booked;
      acc.showed += r.conv_showed;
      acc.closed += r.conv_closed;
      if (r.median_first_response_seconds != null) {
        acc.firstSum += r.median_first_response_seconds; acc.firstN += 1;
      }
      if (r.median_reply_seconds != null) {
        acc.replySum += r.median_reply_seconds; acc.replyN += 1;
      }
      return acc;
    },
    { active: 0, booked: 0, showed: 0, closed: 0, firstSum: 0, firstN: 0, replySum: 0, replyN: 0 },
  );

  const noAccess = scope === "me" && !mySetterId;

  return (
    <div className="h-full flex flex-col">
      <Helmet><title>Stats - {workspace.name}</title><meta name="robots" content="noindex,nofollow" /></Helmet>

      <div className="px-6 pt-6 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1"><BarChart3 className="w-5 h-5 text-primary" /><h1 className="font-display text-2xl font-bold">Stats</h1></div>
        <p className="text-sm text-muted-foreground">Setter performance and response times. Dubai timezone.</p>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          {canViewAll && (
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                onClick={() => setScope("me")}
                className={`px-3 py-1.5 ${scope === "me" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >Me</button>
              <button
                onClick={() => setScope("team")}
                className={`px-3 py-1.5 ${scope === "team" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >Team</button>
            </div>
          )}

          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          {pipelines.length > 0 && (
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pipelines</SelectItem>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {noAccess && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            You are not registered as a setter in this workspace. Ask a manager to add you on the Settings - Setters tab.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load stats"}
          </div>
        )}

        {!noAccess && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Active chats" value={totals.active.toString()} />
              <StatCard label="Median first response" value={fmtSeconds(totals.firstN ? totals.firstSum / totals.firstN : null)} />
              <StatCard label="Median reply time" value={fmtSeconds(totals.replyN ? totals.replySum / totals.replyN : null)} />
              <StatCard label="Booked" value={totals.booked.toString()} />
              <StatCard label="Closed / Won" value={totals.closed.toString()} />
            </div>

            <div className="rounded-lg border border-border bg-card/30 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Setter</th>
                    <th className="text-right px-3 py-2 font-medium">Active</th>
                    <th className="text-right px-3 py-2 font-medium">First reply (median)</th>
                    <th className="text-right px-3 py-2 font-medium">Reply time (median)</th>
                    <th className="text-right px-3 py-2 font-medium">Replies in range</th>
                    <th className="text-right px-3 py-2 font-medium">Booked</th>
                    <th className="text-right px-3 py-2 font-medium">Showed</th>
                    <th className="text-right px-3 py-2 font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No data for this range.</td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.setter_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        {r.display_name}
                        {r.is_external && <span className="text-muted-foreground text-xs ml-1">(external)</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{r.active_chats}</td>
                      <td className="px-3 py-2 text-right">{fmtSeconds(r.median_first_response_seconds)}</td>
                      <td className="px-3 py-2 text-right">{fmtSeconds(r.median_reply_seconds)}</td>
                      <td className="px-3 py-2 text-right">{r.replies_in_window}</td>
                      <td className="px-3 py-2 text-right">{r.conv_booked}</td>
                      <td className="px-3 py-2 text-right">{r.conv_showed}</td>
                      <td className="px-3 py-2 text-right">{r.conv_closed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-card/30 p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-display text-2xl mt-1">{value}</div>
  </div>
);

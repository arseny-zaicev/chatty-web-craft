import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, CheckCircle2, Loader2, RefreshCw, MessageSquare, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Issue = {
  kind: "inbound_missing" | "outbound_status_synced" | "outbound_no_status";
  provider_message_id: string | null;
  contact_phone: string | null;
  whatsapp_number_id: string | null;
  message_id?: string | null;
  conversation_id?: string | null;
  detail?: string | null;
  occurred_at?: string | null;
};

type Result = {
  ok: boolean;
  workspace_id: string;
  hours: number;
  auto_fix: boolean;
  ran_at: string;
  inbound: { checked: number; missing: number; recovered: number };
  outbound: { checked: number; synced: number; marked_failed: number };
  issues: Issue[];
};

const STORAGE_KEY = (wsId: string) => `iskra:reconcile:last:${wsId}`;

function loadCached(wsId: string): Result | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(wsId));
    return raw ? (JSON.parse(raw) as Result) : null;
  } catch {
    return null;
  }
}

function saveCached(wsId: string, res: Result) {
  try {
    localStorage.setItem(STORAGE_KEY(wsId), JSON.stringify(res));
  } catch {
    /* ignore */
  }
}

export function MessageIntegrityPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [hours, setHours] = useState<number>(24);
  const [autoFix, setAutoFix] = useState<boolean>(true);
  const [result, setResult] = useState<Result | null>(() => loadCached(workspaceId));

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<Result>("reconcile-messages", {
        body: { workspace_id: workspaceId, hours, auto_fix: autoFix },
      });
      if (error) throw error;
      if (!data) throw new Error("empty response");
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      saveCached(workspaceId, data);
      const recovered = data.inbound.recovered;
      const synced = data.outbound.synced;
      const failed = data.outbound.marked_failed;
      if (recovered + synced + failed === 0) {
        toast.success("Integrity check complete - nothing to fix");
      } else {
        toast.success(
          `Reconciled: ${recovered} inbound recovered, ${synced} outbound synced, ${failed} marked failed`,
        );
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reconcile failed"),
  });

  const hasIssues = (result?.issues.length ?? 0) > 0;
  const cleanRun = result && !hasIssues;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Message integrity
          {result && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              Last check {formatDistanceToNow(new Date(result.ran_at), { addSuffix: true })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Last 6 hours</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="72">Last 3 days</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <label className="text-xs text-muted-foreground flex items-center gap-1.5 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={autoFix}
              onChange={(e) => setAutoFix(e.target.checked)}
              className="accent-primary"
            />
            Auto-recover missing
          </label>
          <Button
            size="sm"
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="ml-auto"
          >
            {run.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking...</>
            ) : (
              <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Run check</>
            )}
          </Button>
        </div>

        {!result && !run.isPending && (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Press <strong className="text-foreground">Run check</strong> to scan webhook receipts vs persisted messages. No tokens are used - this only reads from the database.
          </div>
        )}

        {result && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                icon={MessageSquare}
                label="Inbound (received → persisted)"
                value={`${result.inbound.checked - result.inbound.missing + result.inbound.recovered} / ${result.inbound.checked}`}
                clean={result.inbound.missing === result.inbound.recovered}
                extra={result.inbound.recovered > 0 ? `${result.inbound.recovered} recovered` : null}
              />
              <Stat
                icon={Send}
                label="Outbound stuck > 1h"
                value={`${result.outbound.synced + result.outbound.marked_failed} / ${result.outbound.checked} resolved`}
                clean={result.outbound.checked === 0 || result.outbound.synced + result.outbound.marked_failed === result.outbound.checked}
                extra={result.outbound.marked_failed > 0 ? `${result.outbound.marked_failed} marked failed` : null}
              />
            </div>

            {cleanRun && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-sm p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                All messages accounted for in the last {result.hours}h.
              </div>
            )}

            {hasIssues && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {result.issues.length} {result.issues.length === 1 ? "event" : "events"}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {result.issues.slice(0, 100).map((it, idx) => (
                    <IssueRow key={`${it.provider_message_id ?? idx}-${idx}`} issue={it} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon, label, value, clean, extra,
}: { icon: any; label: string; value: string; clean: boolean; extra: string | null }) {
  return (
    <div className={`rounded-lg border p-3 ${clean ? "border-border bg-card/30" : "border-amber-500/30 bg-amber-500/5"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />{label}
      </div>
      <div className="text-lg font-display font-semibold mt-1 flex items-center gap-2">
        {value}
        {clean ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-500" />
        )}
      </div>
      {extra && <div className="text-xs text-muted-foreground mt-0.5">{extra}</div>}
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const isInbound = issue.kind === "inbound_missing";
  const isSynced = issue.kind === "outbound_status_synced";
  const variantCls = isSynced
    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
    : "bg-amber-500/10 text-amber-500 border-amber-500/30";
  const label = isInbound ? "Inbound" : isSynced ? "Synced" : "Outbound";
  return (
    <div className="p-2.5 text-xs flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={variantCls}>{label}</Badge>
          <span className="font-mono text-foreground truncate">{issue.contact_phone ?? issue.provider_message_id ?? "—"}</span>
        </div>
        <div className="text-muted-foreground mt-0.5 truncate">{issue.detail}</div>
      </div>
      <div className="shrink-0 text-muted-foreground">
        {issue.occurred_at ? formatDistanceToNow(new Date(issue.occurred_at), { addSuffix: true }) : ""}
      </div>
    </div>
  );
}

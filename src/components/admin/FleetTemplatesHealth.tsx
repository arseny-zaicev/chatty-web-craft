import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  whatsapp_number_id: string | null;
  synced_at: string | null;
};

type NumberRow = {
  id: string;
  phone_number: string;
  display_name: string | null;
  workspace_id: string | null;
  is_active: boolean;
  provider_app_id: string | null;
};

type Workspace = { id: string; name: string };

type Bucket = {
  number: NumberRow;
  approved: number;
  pending: number;
  rejected: number;
  paused: number;
  total: number;
  lastSync: string | null;
};

type Group = { workspaceId: string | null; workspaceName: string; numbers: Bucket[]; totals: { approved: number; pending: number; rejected: number; paused: number } };

export default function FleetTemplatesHealth() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fleet-templates-health"],
    queryFn: async () => {
      const [{ data: numbers, error: nErr }, { data: tpls, error: tErr }, { data: workspaces, error: wErr }] = await Promise.all([
        supabase.from("whatsapp_numbers").select("id, phone_number, display_name, workspace_id, is_active, provider_app_id").eq("is_active", true).not("provider_app_id", "is", null),
        supabase.from("message_templates").select("id, name, status, workspace_id, whatsapp_number_id, synced_at"),
        supabase.from("workspaces").select("id, name"),
      ]);
      if (nErr) throw nErr; if (tErr) throw tErr; if (wErr) throw wErr;
      return { numbers: (numbers ?? []) as NumberRow[], templates: (tpls ?? []) as Row[], workspaces: (workspaces ?? []) as Workspace[] };
    },
    refetchInterval: 60_000,
  });

  const groups: Group[] = useMemo(() => {
    if (!data) return [];
    const wsName = new Map<string, string>();
    for (const w of data.workspaces) wsName.set(w.id, w.name);
    const byNumber = new Map<string, Bucket>();
    for (const n of data.numbers) {
      byNumber.set(n.id, { number: n, approved: 0, pending: 0, rejected: 0, paused: 0, total: 0, lastSync: null });
    }
    for (const t of data.templates) {
      if (!t.whatsapp_number_id) continue;
      const b = byNumber.get(t.whatsapp_number_id);
      if (!b) continue;
      b.total++;
      const s = t.status as keyof Bucket;
      if (s === "approved") b.approved++;
      else if (s === "rejected") b.rejected++;
      else if (s === "paused") b.paused++;
      else b.pending++;
      if (t.synced_at && (!b.lastSync || t.synced_at > b.lastSync)) b.lastSync = t.synced_at;
    }
    const byWs = new Map<string, Group>();
    for (const b of byNumber.values()) {
      const wsId = b.number.workspace_id ?? "unassigned";
      const name = b.number.workspace_id ? (wsName.get(b.number.workspace_id) ?? "Workspace") : "Unassigned";
      const g = byWs.get(wsId) ?? { workspaceId: b.number.workspace_id, workspaceName: name, numbers: [], totals: { approved: 0, pending: 0, rejected: 0, paused: 0 } };
      g.numbers.push(b);
      g.totals.approved += b.approved; g.totals.pending += b.pending; g.totals.rejected += b.rejected; g.totals.paused += b.paused;
      byWs.set(wsId, g);
    }
    const arr = [...byWs.values()];
    arr.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
    for (const g of arr) g.numbers.sort((a, b) => (a.number.display_name ?? a.number.phone_number).localeCompare(b.number.display_name ?? b.number.phone_number));
    return arr;
  }, [data]);

  const overall = useMemo(() => {
    const t = { approved: 0, pending: 0, rejected: 0, paused: 0 };
    for (const g of groups) { t.approved += g.totals.approved; t.pending += g.totals.pending; t.rejected += g.totals.rejected; t.paused += g.totals.paused; }
    return t;
  }, [groups]);

  const syncOne = useMutation({
    mutationFn: async (whatsapp_number_id: string) => {
      const { data: res, error } = await supabase.functions.invoke("campaigns", { body: { action: "sync_templates", whatsapp_number_id } });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      return res as { upserted: number; fetched: number };
    },
    onSuccess: (res) => { toast.success(`Synced ${res.upserted}/${res.fetched}`); queryClient.invalidateQueries({ queryKey: ["fleet-templates-health"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("templates-status-sync", { body: {} });
      if (error) throw error;
      const r = res as { numbers: number; total_changes: number; failed_numbers: number };
      toast.success(`Synced ${r.numbers} numbers · ${r.total_changes} status changes` + (r.failed_numbers ? ` · ${r.failed_numbers} failed` : ""));
      queryClient.invalidateQueries({ queryKey: ["fleet-templates-health"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk sync failed");
    } finally { setSyncingAll(false); }
  };

  if (isLoading) return <div className="rounded-md border border-border bg-card/40 p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading template health…</div>;
  if (!data || groups.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card/40">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-muted/30 transition-colors">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <FileText className="w-4 h-4 text-primary" />
        <span className="font-medium">Templates health</span>
        <span className="text-muted-foreground">·</span>
        <Pill tone="emerald" icon={<CheckCircle2 className="w-3 h-3" />}>{overall.approved} approved</Pill>
        <Pill tone="amber" icon={<Clock className="w-3 h-3" />}>{overall.pending} pending</Pill>
        {overall.rejected > 0 && <Pill tone="red" icon={<AlertTriangle className="w-3 h-3" />}>{overall.rejected} rejected</Pill>}
        <span className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </Button>
          <Button size="sm" variant="outline" onClick={syncAll} disabled={syncingAll}>
            {syncingAll ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}Sync all from Gupshup
          </Button>
        </span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {groups.map((g) => {
            const key = g.workspaceId ?? "unassigned";
            const isCollapsed = collapsed[key];
            const ready = g.totals.approved > 0 && g.totals.rejected === 0 && g.totals.pending === 0;
            const tone = ready ? "emerald" : g.totals.pending > 0 ? "amber" : g.totals.rejected > 0 ? "red" : "slate";
            return (
              <div key={key} className="px-3 py-2">
                <button onClick={() => setCollapsed((c) => ({ ...c, [key]: !isCollapsed }))} className="w-full flex items-center gap-2 text-sm hover:bg-muted/20 -mx-1 px-1 py-1 rounded">
                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span className="font-medium">{g.workspaceName}</span>
                  <span className="text-xs text-muted-foreground">({g.numbers.length} {g.numbers.length === 1 ? "number" : "numbers"})</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Pill tone="emerald" subtle>{g.totals.approved} ✓</Pill>
                    {g.totals.pending > 0 && <Pill tone="amber" subtle>{g.totals.pending} pending</Pill>}
                    {g.totals.rejected > 0 && <Pill tone="red" subtle>{g.totals.rejected} rejected</Pill>}
                    {g.totals.paused > 0 && <Pill tone="slate" subtle>{g.totals.paused} paused</Pill>}
                    <span className={cn("inline-block w-2 h-2 rounded-full ml-1", tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-red-500" : "bg-slate-400")} />
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="mt-2 ml-5 space-y-1">
                    {g.numbers.map((b) => (
                      <div key={b.number.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="font-mono text-foreground/90 min-w-[140px] truncate">{b.number.display_name || `+${b.number.phone_number}`}</span>
                        <span className="text-muted-foreground">·</span>
                        <Pill tone="emerald" subtle>{b.approved} ✓</Pill>
                        {b.pending > 0 && <Pill tone="amber" subtle>{b.pending} pending</Pill>}
                        {b.rejected > 0 && <Pill tone="red" subtle>{b.rejected} rejected</Pill>}
                        {b.paused > 0 && <Pill tone="slate" subtle>{b.paused} paused</Pill>}
                        {b.total === 0 && <span className="text-muted-foreground italic">no templates</span>}
                        <span className="ml-auto text-muted-foreground">
                          {b.lastSync ? `synced ${formatDistanceToNow(new Date(b.lastSync), { addSuffix: true })}` : "never synced"}
                        </span>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => syncOne.mutate(b.number.id)} disabled={syncOne.isPending}>
                          <RefreshCw className={cn("w-3 h-3", syncOne.isPending && syncOne.variables === b.number.id && "animate-spin")} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Pill({ children, tone, icon, subtle }: { children: React.ReactNode; tone: "emerald" | "amber" | "red" | "slate"; icon?: React.ReactNode; subtle?: boolean }) {
  const cls = subtle
    ? tone === "emerald" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : tone === "amber" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : tone === "red" ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : "bg-muted text-muted-foreground"
    : tone === "emerald" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
      : tone === "amber" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
      : tone === "red" ? "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
      : "bg-muted text-muted-foreground border border-border";
  return <span className={cn("inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium", cls)}>{icon}{children}</span>;
}

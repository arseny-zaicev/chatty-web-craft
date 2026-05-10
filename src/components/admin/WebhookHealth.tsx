import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, PlayCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type NumberRow = {
  id: string;
  phone_number: string;
  display_name: string | null;
  label: string | null;
  provider_app_id: string | null;
  status: string;
  is_active: boolean | null;
  workspace_id: string | null;
  last_inbound_at?: string | null;
};

type FailureRow = {
  id: string;
  reason: string;
  app_name: string | null;
  destination: string | null;
  source: string | null;
  event_type: string | null;
  replay_status: string;
  replay_error: string | null;
  replayed_at: string | null;
  created_at: string;
  payload: unknown;
};

export function WebhookHealth() {
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [replayBusy, setReplayBusy] = useState<string | null>(null);
  const [replayingAll, setReplayingAll] = useState(false);
  const [showReplayed, setShowReplayed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [nums, fails, lastInbound] = await Promise.all([
        supabase
          .from("whatsapp_numbers")
          .select("id, phone_number, display_name, label, provider_app_id, status, is_active, workspace_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("whatsapp_webhook_failures")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("messages")
          .select("conversation_id, created_at, conversations(whatsapp_number_id)")
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      // Reduce last inbound per whatsapp_number_id
      const lastByNumber = new Map<string, string>();
      type InboundJoin = { created_at: string; conversations: { whatsapp_number_id: string } | null };
      for (const m of (lastInbound.data ?? []) as unknown as InboundJoin[]) {
        const wn = m.conversations?.whatsapp_number_id;
        if (!wn) continue;
        if (!lastByNumber.has(wn)) lastByNumber.set(wn, m.created_at);
      }

      const enriched: NumberRow[] = (nums.data ?? []).map((n) => ({
        ...n,
        last_inbound_at: lastByNumber.get(n.id) ?? null,
      }));

      setNumbers(enriched);
      setFailures((fails.data ?? []) as FailureRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const pendingCount = useMemo(() => failures.filter((f) => f.replay_status === "pending").length, [failures]);
  const visibleFailures = useMemo(
    () => (showReplayed ? failures : failures.filter((f) => f.replay_status === "pending")),
    [failures, showReplayed],
  );

  const replayOne = async (id: string) => {
    setReplayBusy(id);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-webhook-replay", {
        body: { ids: [id] },
      });
      if (error) throw error;
      const r = (data?.results ?? [])[0];
      if (r?.ok) toast.success("Replayed");
      else toast.error(r?.error ?? "Replay failed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay failed");
    } finally {
      setReplayBusy(null);
    }
  };

  const replayAll = async () => {
    if (pendingCount === 0) return;
    if (!confirm(`Replay ${pendingCount} pending webhooks?`)) return;
    setReplayingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-webhook-replay", {
        body: { all: true },
      });
      if (error) throw error;
      toast.success(`Replayed ${data?.replayed ?? 0} of ${pendingCount}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay failed");
    } finally {
      setReplayingAll(false);
    }
  };

  const deleteFailure = async (id: string) => {
    if (!confirm("Delete this failure record?")) return;
    const { error } = await supabase.from("whatsapp_webhook_failures").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); await load(); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const numberHealth = (n: NumberRow) => {
    const issues: string[] = [];
    if (!n.provider_app_id) issues.push("no app id");
    if (!n.phone_number) issues.push("no phone");
    if (n.status === "restricted" || n.status === "banned") issues.push(`status: ${n.status}`);
    return issues;
  };

  const numbersWithIssues = numbers.filter((n) => numberHealth(n).length > 0).length;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold">Webhook health</h2>
          <p className="text-sm text-muted-foreground">
            Live view of WhatsApp numbers, last inbound activity, and unmatched webhooks waiting for replay.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Numbers</CardDescription><CardTitle className="text-3xl">{numbers.length}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{numbersWithIssues} with config issues</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending webhook failures</CardDescription><CardTitle className="text-3xl">{pendingCount}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Inbound webhooks not matched to any number</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total failure log</CardDescription><CardTitle className="text-3xl">{failures.length}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Last 200 entries</CardContent>
        </Card>
      </div>

      {/* Numbers table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Numbers</CardTitle>
          <CardDescription>Source of truth for matching: <code>provider_app_id</code> → fallback <code>label</code> → fallback <code>phone_number</code>.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Display name</th>
                <th className="py-2 pr-3">Label</th>
                <th className="py-2 pr-3">App ID</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last inbound</th>
                <th className="py-2 pr-3">Health</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => {
                const issues = numberHealth(n);
                return (
                  <tr key={n.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono">+{n.phone_number}</td>
                    <td className="py-2 pr-3">{n.display_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 pr-3">{n.label ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {n.provider_app_id ? (
                        <span className="text-foreground">{n.provider_app_id}</span>
                      ) : (
                        <span className="text-destructive">missing</span>
                      )}
                    </td>
                    <td className="py-2 pr-3"><Badge variant="outline">{n.status}</Badge></td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {n.last_inbound_at ? formatDistanceToNow(new Date(n.last_inbound_at), { addSuffix: true }) : "never"}
                    </td>
                    <td className="py-2 pr-3">
                      {issues.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> ok</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle className="h-3.5 w-3.5" /> {issues.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Failures table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Unmatched webhooks</CardTitle>
            <CardDescription>Inbound payloads that did not match any number. Fix the number's <code>provider_app_id</code> and replay.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowReplayed((v) => !v)}>
              {showReplayed ? "Hide replayed" : "Show all"}
            </Button>
            <Button size="sm" onClick={replayAll} disabled={pendingCount === 0 || replayingAll}>
              {replayingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Replay all ({pendingCount})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {visibleFailures.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No failures.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">App</th>
                  <th className="py-2 pr-3">Destination</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleFailures.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</td>
                    <td className="py-2 pr-3 text-xs"><code>{f.reason}</code></td>
                    <td className="py-2 pr-3 text-xs font-mono">{f.app_name ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs font-mono">{f.destination ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs font-mono">{f.source ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={f.replay_status === "replayed" ? "default" : f.replay_status === "failed" ? "destructive" : "outline"}>
                        {f.replay_status}
                      </Badge>
                      {f.replay_error && <div className="text-[10px] text-destructive mt-1">{f.replay_error}</div>}
                    </td>
                    <td className="py-2 pr-3 flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => replayOne(f.id)} disabled={replayBusy === f.id}>
                        {replayBusy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteFailure(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

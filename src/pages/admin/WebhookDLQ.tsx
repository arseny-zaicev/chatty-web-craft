import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Eye, Play } from "lucide-react";

type RawRow = {
  id: string;
  received_at: string;
  type: string | null;
  app_name: string | null;
  destination: string | null;
  source: string | null;
  provider_message_id: string | null;
  processing_status: string;
  processed_at: string | null;
  error_message: string | null;
  error_stack: string | null;
  retry_count: number;
  message_id: string | null;
  workspace_id: string | null;
  payload: Record<string, unknown>;
};

const STATUS_COLOR: Record<string, string> = {
  received: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  processed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  skipped: "bg-muted text-muted-foreground",
};

function toGST(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);
}

function extractBodyPreview(payload: Record<string, unknown>): string {
  try {
    const inner = (payload?.payload ?? {}) as Record<string, unknown>;
    const inner2 = (inner?.payload ?? {}) as Record<string, unknown>;
    const txt =
      (inner2?.text as string) ||
      (inner2?.caption as string) ||
      (inner2?.title as string) ||
      (inner?.text as string) ||
      "";
    return txt ? String(txt).slice(0, 120) : "";
  } catch {
    return "";
  }
}

export default function WebhookDLQ() {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewRaw, setViewRaw] = useState<RawRow | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("whatsapp_webhook_raw" as any)
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    if (statusFilter !== "all") q = q.eq("processing_status", statusFilter);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`source.ilike.%${s}%,destination.ilike.%${s}%,app_name.ilike.%${s}%,provider_message_id.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const replay = async (row: RawRow) => {
    setReplayingId(row.id);
    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-webhook`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        toast.error(`Replay failed: ${json.error ?? res.status}`);
      } else {
        toast.success("Replayed - check status in a moment");
      }
      await supabase
        .from("whatsapp_webhook_raw" as any)
        .update({ retry_count: row.retry_count + 1, last_retried_at: new Date().toISOString() })
        .eq("id", row.id);
      setTimeout(load, 1500);
    } catch (e: any) {
      toast.error(`Replay error: ${e.message}`);
    } finally {
      setReplayingId(null);
    }
  };

  const counts = rows.reduce((acc, r) => {
    acc[r.processing_status] = (acc[r.processing_status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhook DLQ</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Raw archive of every inbound WhatsApp webhook. Replay any payload that failed to persist.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {(["received", "processed", "failed", "skipped"] as const).map((s) => (
          <Card key={s} className="px-4 py-3">
            <div className="text-xs text-muted-foreground uppercase">{s}</div>
            <div className="text-2xl font-semibold">{counts[s] ?? 0}</div>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="received">Received (stuck)</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search phone / app / provider msg id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          className="max-w-md"
        />
        <Button variant="secondary" onClick={load}>Search</Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Time (GST)</th>
              <th className="p-3">Status</th>
              <th className="p-3">Type</th>
              <th className="p-3">App</th>
              <th className="p-3">From</th>
              <th className="p-3">To</th>
              <th className="p-3">Body preview</th>
              <th className="p-3">Error</th>
              <th className="p-3">Retries</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-3 whitespace-nowrap font-mono text-xs">{toGST(r.received_at)}</td>
                <td className="p-3">
                  <Badge className={STATUS_COLOR[r.processing_status] ?? ""} variant="outline">
                    {r.processing_status}
                  </Badge>
                </td>
                <td className="p-3">{r.type ?? "-"}</td>
                <td className="p-3 text-xs">{r.app_name ?? "-"}</td>
                <td className="p-3 font-mono text-xs">{r.source ?? "-"}</td>
                <td className="p-3 font-mono text-xs">{r.destination ?? "-"}</td>
                <td className="p-3 max-w-xs truncate">{extractBodyPreview(r.payload)}</td>
                <td className="p-3 text-red-600 dark:text-red-400 text-xs max-w-xs truncate" title={r.error_message ?? ""}>
                  {r.error_message ?? ""}
                </td>
                <td className="p-3 text-xs">{r.retry_count}</td>
                <td className="p-3 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewRaw(r)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  {(r.processing_status === "failed" || r.processing_status === "received") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => replay(r)}
                      disabled={replayingId === r.id}
                      title="Replay payload through webhook"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!viewRaw} onOpenChange={(o) => !o && setViewRaw(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Raw payload</DialogTitle></DialogHeader>
          {viewRaw && (
            <pre className="text-xs bg-muted p-4 rounded overflow-auto">
              {JSON.stringify(viewRaw.payload, null, 2)}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

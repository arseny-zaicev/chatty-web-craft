import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Search, FileText, Copy, Check, MessageSquare, Phone, Globe, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { crmKeys, fetchCampaignBase, senderFullLabel } from "@/lib/crmData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

type TemplateRow = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  body: string | null;
  whatsapp_number_id: string | null;
  buttons: any;
  quality: string | null;
  namespace: string | null;
  external_id: string | null;
  variables: any;
  synced_at: string | null;
  created_at: string;
  provider_template_id: string | null;
};

type NumberRow = { id: string; phone_number: string; display_name: string | null; provider_app_id: string | null; label: string | null };

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
  pending: { label: "Pending review", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-500 animate-pulse" },
  rejected: { label: "Rejected", cls: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-500" },
  paused: { label: "Paused", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", dot: "bg-zinc-500" },
};

const CATEGORY_META: Record<string, string> = {
  marketing: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  utility: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  authentication: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export default function TemplatesView({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: crmKeys.campaigns(workspaceId),
    queryFn: () => fetchCampaignBase(workspaceId),
  });

  const numbers: NumberRow[] = (data?.numbers ?? []) as NumberRow[];
  const templates: TemplateRow[] = (data?.templates ?? []) as TemplateRow[];

  const [numberId, setNumberId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const sendingNumberId = numbers[0]?.id ?? "";

  const syncMutation = useMutation({
    mutationFn: async (whatsapp_number_id: string) => {
      if (!whatsapp_number_id) throw new Error("No WhatsApp number for this client");
      const { data: res, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "sync_templates", whatsapp_number_id },
      });
      if (error) throw error;
      if ((res as { error?: string })?.error) throw new Error((res as { error: string }).error);
      return res as { fetched: number; upserted: number; incomplete?: number };
    },
    onSuccess: async (res) => {
      toast.success(`Synced ${res.upserted}/${res.fetched} templates from Gupshup`);
      if (res.incomplete && res.incomplete > 0) {
        toast.warning(
          `${res.incomplete} template${res.incomplete === 1 ? "" : "s"} missing moderation reference samples (the "Sample" field in Gupshup). This is for reference only - it does NOT replace per-row data. Per-row variables must come from the audience batch (derived_payload.var_N).`,
          { duration: 10000 },
        );
      }
      await queryClient.invalidateQueries({ queryKey: crmKeys.campaigns(workspaceId) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Sync failed"),
  });

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (numberId !== "all" && t.whatsapp_number_id !== numberId) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !(t.body ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [templates, numberId, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { total: templates.length, approved: 0, pending: 0, rejected: 0, paused: 0 };
    templates.forEach((t) => {
      if (t.status === "approved") c.approved++;
      else if (t.status === "rejected") c.rejected++;
      else if (t.status === "paused") c.paused++;
      else c.pending++;
    });
    return c;
  }, [templates]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied");
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1200);
  };

  if (isLoading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header + stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg leading-tight">WhatsApp Templates</h2>
            <p className="text-xs text-muted-foreground">Live status from Gupshup. Only Approved templates can be sent.</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => syncMutation.mutate(sendingNumberId)}
          disabled={syncMutation.isPending || !sendingNumberId}
        >
          {syncMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Syncing</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-1.5" />Sync from Gupshup</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Approved" value={counts.approved} accent="text-emerald-400" />
        <StatCard label="Pending" value={counts.pending} accent="text-amber-400" />
        <StatCard label="Rejected" value={counts.rejected} accent="text-red-400" />
        <StatCard label="Paused" value={counts.paused} accent="text-zinc-400" />
      </div>

      {/* Filters */}
      <div className="grid sm:grid-cols-[1fr_200px_200px] gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or body..."
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Select value={numberId} onValueChange={setNumberId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All numbers</SelectItem>
            {numbers.map((n) => (
              <SelectItem key={n.id} value={n.id}>{senderFullLabel(n)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <div className="font-medium">No templates yet</div>
          <p className="text-sm text-muted-foreground mt-1">
            Hit <span className="text-foreground">Sync from Gupshup</span> to pull all templates and statuses.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((t) => {
            const status = STATUS_META[t.status] ?? STATUS_META.pending;
            const catCls = CATEGORY_META[t.category] ?? "bg-muted text-muted-foreground border-border";
            const number = numbers.find((n) => n.id === t.whatsapp_number_id);
            const buttons: any[] = Array.isArray(t.buttons) ? t.buttons : [];
            const variables: string[] = Array.isArray(t.variables) ? t.variables : [];

            return (
              <div
                key={t.id}
                className="group rounded-xl border border-border bg-card/40 hover:bg-card/60 transition-colors flex flex-col"
              >
                <div className="p-4 border-b border-border/60 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${status.dot}`} />
                      <button
                        onClick={() => copy(t.name, t.id)}
                        className="font-mono text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1.5"
                        title="Click to copy name"
                      >
                        {t.name}
                        {copied === t.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${status.cls}`}>{status.label}</Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${catCls}`}>{t.category}</Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                        <Globe className="w-2.5 h-2.5" />{t.language}
                      </Badge>
                      {t.quality && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">Q: {t.quality}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {t.body && (
                  <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 flex-1 min-h-[80px]">
                    {t.body}
                  </div>
                )}

                {(buttons.length > 0 || variables.length > 0) && (
                  <div className="px-4 pb-3 space-y-2">
                    {buttons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {buttons.map((b, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                          >
                            <MessageSquare className="w-3 h-3" />
                            {b.text || b.title || b.type}
                          </span>
                        ))}
                      </div>
                    )}
                    {variables.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {variables.map((v) => (
                          <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20 text-[11px] text-muted-foreground flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {number && (
                      <>
                        <button
                          onClick={() => copy(`+${number.phone_number}`, `${t.id}-phone`)}
                          className="font-mono text-foreground/90 hover:text-primary text-left truncate"
                          title="Click to copy phone"
                        >+{number.phone_number}</button>
                        {number.display_name && (
                          <span className="truncate">{number.display_name}</span>
                        )}
                        {(number.provider_app_id || number.label) && (
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground/80">
                            {number.provider_app_id && (
                              <button
                                onClick={() => copy(number.provider_app_id!, `${t.id}-app`)}
                                className="font-mono hover:text-primary"
                                title="Click to copy app id"
                              >app:{number.provider_app_id}</button>
                            )}
                            {number.label && (
                              <span className="font-mono">fleet:{number.label}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="shrink-0 whitespace-nowrap">
                    {t.synced_at ? `Synced ${format(new Date(t.synced_at), "MMM d, HH:mm")}` : "Not synced"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/30 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-display ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

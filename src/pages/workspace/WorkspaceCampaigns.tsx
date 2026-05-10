import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Megaphone, Rocket, Loader2, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCampaignSummaries } from "@/lib/launchData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceRole, isManagerLike } from "@/lib/workspaceRole";

// Sibling campaigns launched across multiple WhatsApp numbers share a base name
// in the form "<base> :: <numberLabel>". Clients should see them merged.
const splitBase = (full: string): { base: string; numberLabel: string | null } => {
  const idx = full.indexOf(" :: ");
  if (idx === -1) return { base: full, numberLabel: null };
  return { base: full.slice(0, idx).trim(), numberLabel: full.slice(idx + 4).trim() || null };
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
  whatsapp_number_id: string | null;
  template_id: string | null;
};

type CampaignGroup = {
  key: string;
  displayName: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string;
  template_id: string | null;
  whatsapp_number_ids: string[];
  campaigns: CampaignRow[];
};

// Pick the "most active" status across siblings: running > scheduled > paused > failed > completed > draft
const statusRank: Record<string, number> = {
  running: 6, scheduled: 5, paused: 4, failed: 3, completed: 2, draft: 1,
};

const groupCampaigns = (rows: CampaignRow[]): CampaignGroup[] => {
  const map = new Map<string, CampaignGroup>();
  for (const c of rows) {
    const { base } = splitBase(c.name);
    const key = base;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        displayName: base,
        status: c.status,
        total: 0,
        sent: 0,
        failed: 0,
        created_at: c.created_at,
        template_id: c.template_id,
        whatsapp_number_ids: [],
        campaigns: [],
      };
      map.set(key, g);
    }
    g.total += c.total_recipients ?? 0;
    g.sent += c.sent_count ?? 0;
    g.failed += c.failed_count ?? 0;
    if ((statusRank[c.status] ?? 0) > (statusRank[g.status] ?? 0)) g.status = c.status;
    if (c.created_at < g.created_at) g.created_at = c.created_at;
    if (c.whatsapp_number_id && !g.whatsapp_number_ids.includes(c.whatsapp_number_id)) {
      g.whatsapp_number_ids.push(c.whatsapp_number_id);
    }
    g.campaigns.push(c);
  }
  return Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};

const statusTone: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  running: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  completed: "bg-primary/15 text-primary border-primary/30",
  failed: "bg-red-500/15 text-red-600 border-red-500/30",
};

type RecipientRow = { id: string; status: string; sent_at: string | null; error_message: string | null; contact_phone: string };

const fetchRecipients = async (campaignId: string) => {
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("id, status, sent_at, error_message, contact_phone")
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as RecipientRow[];
};

const fetchCampaignMeta = async (numberIds: string[], templateIds: string[]) => {
  const numbers = new Map<string, { id: string; phone_number: string; label: string | null }>();
  const templates = new Map<string, { id: string; name: string }>();
  if (numberIds.length > 0) {
    const { data } = await supabase.from("whatsapp_numbers").select("id, phone_number, label").in("id", numberIds);
    (data ?? []).forEach((n: any) => numbers.set(n.id, n));
  }
  if (templateIds.length > 0) {
    const { data } = await supabase.from("message_templates").select("id, name").in("id", templateIds);
    (data ?? []).forEach((t: any) => templates.set(t.id, t));
  }
  return { numbers, templates };
};

export default function WorkspaceCampaigns({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { data: campaigns = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["campaigns", "summaries", workspaceId],
    queryFn: () => fetchCampaignSummaries(workspaceId),
    staleTime: 30_000,
  });
  const { data: role } = useWorkspaceRole(workspaceId);
  const canManage = isManagerLike(role);
  const [openKey, setOpenKey] = useState<string | null>(null);

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

  // Clients see merged groups (one row per logical campaign).
  // Managers see every individual campaign so they can drill into a specific number.
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
          {canManage && (
            <Button asChild size="sm"><Link to={`/ws/${slug}/launch`}><Rocket className="w-4 h-4 mr-1.5" />New launch</Link></Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Campaign history and live monitoring.
        {canManage && <> Create new campaigns from <Link to={`/ws/${slug}/launch`} className="text-primary underline">Launch</Link>.</>}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No campaigns yet.
          {canManage && <div className="mt-3"><Button asChild size="sm"><Link to={`/ws/${slug}/launch`}>Launch first campaign</Link></Button></div>}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card/30 divide-y divide-border">
          {groups.map((g) => {
            const template = templateById.get(g.template_id ?? "");
            // For multi-number groups, show "X numbers" instead of one number label
            const numberLabel = g.whatsapp_number_ids.length === 1
              ? (() => { const n = numberById.get(g.whatsapp_number_ids[0]); return n ? (n.label ?? `+${n.phone_number}`) : null; })()
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
                      {[template?.name, numberLabel, formatDistanceToNow(new Date(g.created_at), { addSuffix: true })].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <Stat label="Sent" value={`${g.sent}/${g.total}`} />
                    {g.failed > 0 && <Stat label="Failed" value={g.failed} tone="bad" />}
                  </div>
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

function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-recipients", campaignId],
    queryFn: () => fetchRecipients(campaignId),
  });

  const stats = useMemo(() => {
    const r = data ?? [];
    return {
      total: r.length,
      sent: r.filter((x) => x.sent_at && x.status !== "failed").length,
      pending: r.filter((x) => x.status === "pending" || x.status === "scheduled").length,
      sending: r.filter((x) => x.status === "sending").length,
      failed: r.filter((x) => x.status === "failed").length,
    };
  }, [data]);

  if (isLoading) return <div className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading…</div>;

  return (
    <div className="px-4 pb-4 pt-2 bg-background/40">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Sent" value={stats.sent} tone="good" />
        <Stat label="Sending" value={stats.sending} />
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Failed" value={stats.failed} tone={stats.failed > 0 ? "bad" : undefined} />
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">Delivered / read / reply tracking will appear once provider receipts are wired in.</p>
      {(data ?? []).length > 0 && (
        <div className="rounded-md border border-border bg-card/30 max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0"><tr className="text-left text-muted-foreground">
              <th className="px-2 py-1.5">Phone</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Sent at</th><th className="px-2 py-1.5">Error</th>
            </tr></thead>
            <tbody>
              {(data ?? []).slice(0, 200).map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-2 py-1 font-mono">{r.contact_phone}</td>
                  <td className="px-2 py-1 capitalize">{r.status}</td>
                  <td className="px-2 py-1">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                  <td className="px-2 py-1 text-red-600 truncate max-w-[260px]">{r.error_message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "bad" }) => (
  <div className="rounded-md border border-border bg-card/30 px-2 py-1.5">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-medium ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
  </div>
);

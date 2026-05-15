import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Activity, Pause, Play, ShieldAlert, Loader2, Zap, Users, Gauge, Clock,
} from "lucide-react";
import { toast } from "sonner";

interface RuntimeResponse {
  ok: boolean;
  campaign: {
    id: string;
    status: string;
    dispatch_mode: "paced" | "marketing_instant";
    kill_switch: { at: string; reason: string } | null;
    snapshot: { prepared_at: string; expires_at: string; signature: string; fresh: boolean } | null;
    caps: { per_number: number; per_campaign: number };
  };
  runtime: {
    sent_last_60s: number;
    rate_per_min: number;
    active_senders: string[];
    idle_senders: Array<{ id: string; reason: string; at: string }>;
    pool_participation_alert: boolean;
    idle_pool_members: string[];
  };
}

export default function CampaignRuntimePanel({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["campaign-runtime", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("campaigns", {
        body: { action: "runtime_status", campaign_id: campaignId },
      });
      if (error) throw error;
      return data as RuntimeResponse;
    },
    refetchInterval: 5000,
    enabled: !!campaignId,
  });

  const fireKill = async (scope: "campaign" | "sender" | "instant_mode_global", extra: Record<string, any> = {}, release = false) => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("campaigns", {
        body: { action: "kill_switch", scope, campaign_id: campaignId, release, reason: release ? "released by operator" : "operator", ...extra },
      });
      if (error) throw error;
      toast.success(release ? "Released" : "Killed");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Kill switch failed");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading runtime...
      </div>
    );
  }

  const { campaign, runtime } = data;
  const killed = !!campaign.kill_switch;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-sm">Campaign runtime</h3>
          <Badge variant={campaign.dispatch_mode === "marketing_instant" ? "default" : "secondary"} className="text-[10px]">
            {campaign.dispatch_mode === "marketing_instant" ? <><Zap className="w-3 h-3 mr-1" />Instant</> : "Paced"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{campaign.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {killed ? (
            <Button size="sm" variant="outline" onClick={() => fireKill("campaign", {}, true)} disabled={busy}>
              <Play className="w-3.5 h-3.5 mr-1" /> Release kill
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => fireKill("campaign")} disabled={busy}>
              <Pause className="w-3.5 h-3.5 mr-1" /> Pause campaign
            </Button>
          )}
        </div>
      </div>

      {killed && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive p-2 text-xs">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Kill switch engaged</div>
            <div className="opacity-80">{campaign.kill_switch!.reason} - {new Date(campaign.kill_switch!.at).toLocaleString()}</div>
          </div>
        </div>
      )}

      {campaign.snapshot && !campaign.snapshot.fresh && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Snapshot expired - re-prepare before relaunch.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Tile icon={<Gauge className="w-3.5 h-3.5" />} label="Rate (last 60s)" value={`${runtime.rate_per_min}/min`} />
        <Tile icon={<Users className="w-3.5 h-3.5" />} label="Active senders" value={runtime.active_senders.length.toString()} />
        <Tile icon={<Clock className="w-3.5 h-3.5" />} label="Sent last 60s" value={runtime.sent_last_60s.toString()} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Tile label="Inflight cap / number" value={campaign.caps.per_number?.toString() ?? "-"} />
        <Tile label="Inflight cap / campaign" value={campaign.caps.per_campaign?.toString() ?? "-"} />
      </div>

      {runtime.pool_participation_alert && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 p-2 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Pool participation low</div>
            <div className="opacity-80">
              Window is open but fewer than half of selected senders sent in the last 5 minutes.
              {runtime.idle_pool_members.length > 0 && ` Idle: ${runtime.idle_pool_members.length}.`}
            </div>
          </div>
        </div>
      )}

      {runtime.idle_senders.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Idle senders (with reasons)</div>
          <div className="space-y-1">
            {runtime.idle_senders.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs rounded-md border px-2 py-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px]">{s.id.slice(0, 8)}</span>
                  <Badge variant="outline" className="text-[10px]">{s.reason}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{new Date(s.at).toLocaleTimeString()}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => fireKill("sender", { whatsapp_number_id: s.id }, true)} disabled={busy}>
                    Unpause
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Global instant mode kill switch (admin)</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => fireKill("instant_mode_global", {}, false)} disabled={busy}>Disable globally</Button>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => fireKill("instant_mode_global", {}, true)} disabled={busy}>Re-enable</Button>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="font-medium text-sm mt-0.5">{value}</div>
    </div>
  );
}

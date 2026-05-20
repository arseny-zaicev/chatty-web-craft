import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Zap, Timer, Info } from "lucide-react";
import { toast } from "sonner";

export type DispatchMode = "paced" | "marketing_instant";

const INFLIGHT_NUMBER_MAX = 500;
const INFLIGHT_CAMPAIGN_MAX = 5000;

export interface PrepareInput {
  campaign_id?: string | null;
  numbers: Array<{ number_id: string; template_id: string }>;
  audience_count: number;
  window_start: string;
  window_end: string;
  per_number_quota: number;
  respect_recipient_tz?: boolean;
  scheduled_dates?: string[];
  delay_min_seconds?: number;
}


interface SnapshotNumber {
  id: string;
  phone: string;
  status: string;
  webhook_connected: boolean;
  allocation: number;
  daily_cap: number;
  backoff_until: string | null;
}

interface WorkspaceGuardSnapshot {
  enabled: boolean;
  hard_daily_cap: number | null;
  hard_per_campaign_cap: number | null;
  force_paced: boolean;
  workspace_sent_today: number;
  workspace_pending: number;
  planned_volume: number;
}

interface Snapshot {
  signature: string;
  expires_at: string;
  dispatch_mode: DispatchMode;
  numbers: SnapshotNumber[];
  templates: Array<{ id: string; name: string; status: string }>;
  audience: { total: number; allocated: number };
  capacity?: { per_day: number; today: number; total: number; truncated: number; days: number; per_number_caps: Record<string, number> };
  caps: { per_number_inflight: number; per_campaign_inflight: number; per_number_daily: number };
  window: { start: string; end: string; per_recipient_tz: boolean };
  blockers: string[];
  warnings: string[];
  workspace_guard?: WorkspaceGuardSnapshot | null;
  would_defer_to_next_day?: boolean;
  kill_switch_engaged?: boolean;
  notice: string | null;
}

interface Props {
  prepareInput: PrepareInput;
  onSnapshotChange?: (s: { mode: DispatchMode; maxInflightPerNumber: number; maxInflightPerCampaign: number; ok: boolean; signature: string | null }) => void;
}

export default function DispatchControlPanel({ prepareInput, onSnapshotChange }: Props) {
  const [mode, setMode] = useState<DispatchMode>("marketing_instant");
  const [maxInflightPerNumber, setMaxInflightPerNumber] = useState(5);
  const [maxInflightPerCampaign, setMaxInflightPerCampaign] = useState(50);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-stale when input signature-relevant fields change.
  const inputKey = useMemo(
    () =>
      JSON.stringify({
        n: prepareInput.numbers.map((n) => n.number_id).sort(),
        t: prepareInput.numbers.map((n) => n.template_id).sort(),
        a: prepareInput.audience_count,
        ws: prepareInput.window_start,
        we: prepareInput.window_end,
        q: prepareInput.per_number_quota,
        in: maxInflightPerNumber,
        ic: maxInflightPerCampaign,
        m: mode,
      }),
    [prepareInput, maxInflightPerNumber, maxInflightPerCampaign, mode],
  );
  const [snapshotInputKey, setSnapshotInputKey] = useState<string | null>(null);
  const stale = snapshot && snapshotInputKey !== inputKey;
  const expired = snapshot && new Date(snapshot.expires_at).getTime() < now;
  const fresh = !!snapshot && !stale && !expired;
  const ok = fresh && snapshot.blockers.length === 0;
  const expiresInMs = snapshot ? new Date(snapshot.expires_at).getTime() - now : 0;

  useEffect(() => {
    onSnapshotChange?.({
      mode,
      maxInflightPerNumber,
      maxInflightPerCampaign,
      ok: !!ok,
      signature: snapshot?.signature ?? null,
    });
  }, [mode, maxInflightPerNumber, maxInflightPerCampaign, ok, snapshot?.signature, onSnapshotChange]);

  const prepare = async () => {
    if (prepareInput.numbers.length === 0 || prepareInput.audience_count <= 0) {
      toast.error("Pick numbers + an audience first");
      return;
    }
    setPreparing(true);
    try {
      const { data, error } = await supabase.functions.invoke("campaigns", {
        body: {
          action: "prepare",
          dispatch_mode: mode,
          numbers: prepareInput.numbers,
          audience_count: prepareInput.audience_count,
          window_start: prepareInput.window_start,
          window_end: prepareInput.window_end,
          per_number_quota: prepareInput.per_number_quota,
          max_inflight_per_number: maxInflightPerNumber,
          max_inflight_per_campaign: maxInflightPerCampaign,
          respect_recipient_tz: prepareInput.respect_recipient_tz !== false,
          scheduled_dates: prepareInput.scheduled_dates ?? [],
          delay_min_seconds: prepareInput.delay_min_seconds ?? (mode === "marketing_instant" ? 0 : 30),
          campaign_id: prepareInput.campaign_id ?? null,
        },
      });
      if (error) throw error;
      const snap: Snapshot = (data as any).snapshot;
      setSnapshot(snap);
      setSnapshotInputKey(inputKey);
      if (snap.blockers.length === 0) toast.success("Snapshot prepared. Valid for 15 min.");
      else toast.warning(`Prepared with ${snap.blockers.length} blocker(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Prepare failed");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-sm">Dispatch control</h3>
        </div>
        {snapshot && (
          <Badge variant={ok ? "default" : stale || expired ? "destructive" : "secondary"}>
            {expired ? "Expired" : stale ? "Stale" : ok ? "Ready" : "Has blockers"}
          </Badge>
        )}
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Mode</Label>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as DispatchMode)} className="grid grid-cols-2 gap-2 mt-1">
          <label className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${mode === "marketing_instant" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="marketing_instant" />
            <div>
              <div className="text-sm font-medium flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Marketing Instant</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">No artificial pacing. Each recipient sends as soon as their local window opens.</div>
            </div>
          </label>
          <label className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${mode === "paced" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="paced" />
            <div>
              <div className="text-sm font-medium flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Paced</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Existing pacing + jitter. Conservative throughput.</div>
            </div>
          </label>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-muted-foreground self-center mr-1">Presets:</span>
          {[
            { label: "1 fast", n: 200, c: 200 },
            { label: "2 fast", n: 200, c: 400 },
            { label: "5 fast", n: 200, c: 1000 },
            { label: "7 fast", n: 200, c: 1400 },
          ].map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => { setMaxInflightPerNumber(p.n); setMaxInflightPerCampaign(p.c); }}
            >
              {p.label} - {p.n}/{p.c}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Max inflight / number (1-{INFLIGHT_NUMBER_MAX})</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={INFLIGHT_NUMBER_MAX}
              value={maxInflightPerNumber}
              onChange={(e) => setMaxInflightPerNumber(e.target.value === "" ? 1 : Math.max(1, Math.floor(Number(e.target.value))))}
              onBlur={(e) => { const v = Math.max(1, Math.min(INFLIGHT_NUMBER_MAX, Math.floor(Number(e.target.value) || 1))); setMaxInflightPerNumber(v); }}
            />
            {maxInflightPerNumber > INFLIGHT_NUMBER_MAX && (
              <div className="text-[11px] text-rose-600 mt-0.5">Above backend max ({INFLIGHT_NUMBER_MAX}) - will be clamped on save.</div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Max inflight / campaign (1-{INFLIGHT_CAMPAIGN_MAX})</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={INFLIGHT_CAMPAIGN_MAX}
              value={maxInflightPerCampaign}
              onChange={(e) => setMaxInflightPerCampaign(e.target.value === "" ? 1 : Math.max(1, Math.floor(Number(e.target.value))))}
              onBlur={(e) => { const v = Math.max(1, Math.min(INFLIGHT_CAMPAIGN_MAX, Math.floor(Number(e.target.value) || 1))); setMaxInflightPerCampaign(v); }}
            />
            {maxInflightPerCampaign > INFLIGHT_CAMPAIGN_MAX && (
              <div className="text-[11px] text-rose-600 mt-0.5">Above backend max ({INFLIGHT_CAMPAIGN_MAX}) - will be clamped on save.</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={prepare} disabled={preparing}>
          {preparing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          {snapshot ? "Re-prepare" : "Prepare snapshot"}
        </Button>
        {snapshot && fresh && (
          <span className="text-[11px] text-muted-foreground">
            Expires in {Math.max(0, Math.floor(expiresInMs / 60000))}m {Math.max(0, Math.floor((expiresInMs % 60000) / 1000))}s
          </span>
        )}
        {stale && <span className="text-[11px] text-amber-600">Inputs changed - re-prepare required</span>}
        {expired && <span className="text-[11px] text-rose-600">Snapshot expired - re-prepare</span>}
      </div>

      {snapshot && (
        <>
          {snapshot.notice && (
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-[11px]">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{snapshot.notice}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground text-[10px] uppercase">Selected audience</div>
              <div className="font-medium">{snapshot.audience.total.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground text-[10px] uppercase">Allocated</div>
              <div className="font-medium">{snapshot.audience.allocated.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground text-[10px] uppercase">Capacity ({snapshot.capacity?.days ?? 1}d)</div>
              <div className="font-medium">
                {(snapshot.capacity?.total ?? snapshot.audience.allocated).toLocaleString()}
                {snapshot.capacity && snapshot.capacity.truncated > 0 && (
                  <span className="ml-1 text-[10px] text-rose-600">−{snapshot.capacity.truncated.toLocaleString()} truncated</span>
                )}
              </div>
            </div>
          </div>


          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Allocation per number</div>
            <div className="space-y-1">
              {snapshot.numbers.map((n) => (
                <div key={n.id} className="flex items-center justify-between text-xs rounded-md border px-2 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{n.phone}</span>
                    <Badge variant="outline" className="text-[9px]">{n.status}</Badge>
                    {!n.webhook_connected && <Badge variant="destructive" className="text-[9px]">no webhook</Badge>}
                    {n.backoff_until && <Badge variant="secondary" className="text-[9px]">backoff</Badge>}
                  </div>
                  <span className={n.allocation === 0 ? "text-rose-600 font-medium" : ""}>
                    {n.allocation} / {n.daily_cap}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {(snapshot.blockers.length > 0 || snapshot.warnings.length > 0) && (
            <div className="space-y-1">
              {snapshot.blockers.map((b, i) => (
                <div key={`b${i}`} className="flex items-start gap-2 text-xs text-rose-600">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {b}
                </div>
              ))}
              {snapshot.warnings.map((w, i) => (
                <div key={`w${i}`} className="flex items-start gap-2 text-xs text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}

          {ok && (
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> All checks passed. Launch is unblocked.
            </div>
          )}
        </>
      )}
    </div>
  );
}

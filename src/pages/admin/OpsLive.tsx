import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Activity, AlertTriangle, CheckCircle2, Radio, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evaluateAdminAccess } from "@/lib/adminGuard";
import { IskraLoader } from "@/components/IskraLoader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type Status = "ok" | "warn" | "crit" | "idle";

const statusRing: Record<Status, string> = {
  ok: "ring-emerald-500/40 shadow-[0_0_40px_-10px_rgba(16,185,129,0.55)]",
  warn: "ring-amber-400/40 shadow-[0_0_40px_-10px_rgba(251,191,36,0.55)]",
  crit: "ring-rose-500/50 shadow-[0_0_40px_-10px_rgba(244,63,94,0.6)]",
  idle: "ring-white/10",
};

const statusDot: Record<Status, string> = {
  ok: "bg-emerald-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.7)]",
  warn: "bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.7)]",
  crit: "bg-rose-500 shadow-[0_0_12px_2px_rgba(244,63,94,0.7)]",
  idle: "bg-white/30",
};

const statusText: Record<Status, string> = {
  ok: "text-emerald-300",
  warn: "text-amber-300",
  crit: "text-rose-300",
  idle: "text-white/50",
};

function Panel({
  children,
  className,
  title,
  subtitle,
  status = "idle",
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  status?: Status;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.015] backdrop-blur-sm ring-1 transition-all",
        statusRing[status],
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn("h-2 w-2 rounded-full", statusDot[status])} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 truncate">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[11px] text-white/30 truncate">· {subtitle}</span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  delta,
  status = "idle",
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  status?: Status;
  hint?: string;
}) {
  return (
    <Panel status={status} className="overflow-hidden">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {label}
          </span>
          <span className={cn("h-2 w-2 rounded-full", statusDot[status])} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-6xl xl:text-7xl font-semibold tracking-tight text-white tabular-nums leading-none">
            {value}
          </span>
          {unit && <span className="text-xl text-white/40">{unit}</span>}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={cn("font-medium tabular-nums", statusText[status])}>
            {delta ?? "—"}
          </span>
          {hint && <span className="text-white/35">{hint}</span>}
        </div>
      </div>
    </Panel>
  );
}

function HealthRow({ label, value, status }: { label: string; value: string; status: Status }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusDot[status])} />
        <span className="text-base text-white/80 truncate">{label}</span>
      </div>
      <span className={cn("text-base font-medium tabular-nums", statusText[status])}>{value}</span>
    </div>
  );
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function OpsLive() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: { session } }, r] = await Promise.all([
        supabase.auth.getSession(),
        evaluateAdminAccess(),
      ]);
      if (!mounted) return;
      if (!session || r.state === "redirect") {
        navigate(r.state === "redirect" ? r.to : "/admin-auth");
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Tick clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto refresh every 5 min
  useEffect(() => {
    const id = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setLastUpdated(new Date());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setLastUpdated(new Date());
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const nextRefreshIn = useMemo(() => {
    const elapsed = now.getTime() - lastUpdated.getTime();
    const remaining = Math.max(0, REFRESH_INTERVAL_MS - elapsed);
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [now, lastUpdated]);

  if (!authChecked) {
    return <IskraLoader message="Loading mission control…" />;
  }

  return (
    <div
      key={refreshKey}
      className="min-h-screen w-full bg-[#07090d] text-white antialiased overflow-hidden relative"
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 12% -10%, rgba(16,185,129,0.10), transparent 60%), radial-gradient(700px 400px at 100% 0%, rgba(56,189,248,0.06), transparent 60%), radial-gradient(600px 600px at 50% 110%, rgba(168,85,247,0.05), transparent 70%)",
      }}
    >
      {/* Ambient grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 flex flex-col h-screen p-6 xl:p-8 gap-6">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300/90">
                Live · Ops
              </span>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <h1 className="font-display text-2xl xl:text-3xl font-semibold tracking-tight">
              Mission Control
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right leading-tight hidden md:block">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Local</div>
              <div className="font-display text-2xl xl:text-3xl font-semibold tabular-nums">
                {formatTime(now)}
              </div>
            </div>
            <div className="text-right leading-tight hidden md:block">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Last update
              </div>
              <div className="text-sm tabular-nums text-white/70">
                {formatTime(lastUpdated)} · next in {nextRefreshIn}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              className="border border-white/10 bg-white/5 hover:bg-white/10 text-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFullscreen}
              className="border border-white/10 bg-white/5 hover:bg-white/10 text-white"
              aria-label="Toggle fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Main grid */}
        <main className="grid flex-1 min-h-0 grid-cols-12 grid-rows-12 gap-6">
          {/* Hero KPIs - 4 cards across the top */}
          <div className="col-span-12 row-span-5 grid grid-cols-2 xl:grid-cols-4 gap-6">
            <KpiCard
              label="Messages sent · 24h"
              value="—"
              status="idle"
              hint="awaiting data audit"
            />
            <KpiCard
              label="Reply rate · 24h"
              value="—"
              unit="%"
              status="idle"
              hint="awaiting data audit"
            />
            <KpiCard
              label="Positive leads · 24h"
              value="—"
              status="idle"
              hint="awaiting data audit"
            />
            <KpiCard
              label="Active campaigns"
              value="—"
              status="idle"
              hint="awaiting data audit"
            />
          </div>

          {/* Operational health */}
          <Panel
            title="Fleet & system health"
            status="idle"
            className="col-span-12 xl:col-span-4 row-span-7"
          >
            <div className="flex flex-col">
              <HealthRow label="WhatsApp numbers — active" value="—" status="idle" />
              <HealthRow label="Numbers — restricted" value="—" status="idle" />
              <HealthRow label="Numbers — blocked" value="—" status="idle" />
              <HealthRow label="Gupshup API" value="—" status="idle" />
              <HealthRow label="Slack dispatch queue" value="—" status="idle" />
              <HealthRow label="Inbox watcher" value="—" status="idle" />
            </div>
            <p className="mt-5 text-[11px] text-white/35 leading-relaxed">
              Indicators will turn green / amber / red once the data sources are confirmed.
            </p>
          </Panel>

          {/* Activity */}
          <Panel
            title="Live activity"
            subtitle="active campaigns & top clients"
            status="idle"
            className="col-span-12 xl:col-span-5 row-span-7"
          >
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[260px] text-white/40 gap-3">
              <Activity className="h-10 w-10 text-white/20" />
              <p className="text-sm">
                Reserved for live campaign progress and top-performing workspaces.
              </p>
              <p className="text-[11px] text-white/30">
                Stream wires up after the metrics audit.
              </p>
            </div>
          </Panel>

          {/* Alerts */}
          <Panel
            title="Alerts & incidents"
            status="ok"
            className="col-span-12 xl:col-span-3 row-span-7 bg-gradient-to-b from-emerald-500/[0.04] to-transparent"
          >
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[260px] gap-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-400/80" />
              <div className="text-lg font-semibold text-white">All clear</div>
              <p className="text-xs text-white/40 max-w-[220px]">
                Critical incidents will surface here with sound and color cues.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 w-full">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Crit</div>
                  <div className="text-lg font-semibold text-rose-400 tabular-nums">0</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Warn</div>
                  <div className="text-lg font-semibold text-amber-300 tabular-nums">0</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Info</div>
                  <div className="text-lg font-semibold text-sky-300 tabular-nums">0</div>
                </div>
              </div>
            </div>
          </Panel>
        </main>

        {/* Footer */}
        <footer className="flex items-center justify-between text-[11px] text-white/35 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              Pre-audit build · metric definitions and thresholds will be locked after the data
              source review.
            </span>
          </div>
          <div className="tabular-nums">Auto-refresh every 5 min</div>
        </footer>
      </div>
    </div>
  );
}

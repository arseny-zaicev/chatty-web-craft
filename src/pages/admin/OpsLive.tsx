import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Activity, CheckCircle2, Radio, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evaluateAdminAccess } from "@/lib/adminGuard";
import { IskraLoader } from "@/components/IskraLoader";
import { IskraLogo } from "@/components/IskraLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type Status = "ok" | "warn" | "crit" | "idle";

const ringByStatus: Record<Status, string> = {
  ok: "shadow-[0_0_60px_-20px_hsl(152_80%_55%/0.55)] border-[hsl(152_60%_45%/0.35)]",
  warn: "shadow-[0_0_60px_-20px_hsl(38_85%_55%/0.55)] border-[hsl(38_60%_50%/0.35)]",
  crit: "shadow-[0_0_60px_-20px_hsl(0_85%_60%/0.6)] border-[hsl(0_70%_55%/0.4)]",
  idle: "border-[hsl(42_25%_90%/0.08)]",
};

const dotByStatus: Record<Status, string> = {
  ok: "bg-[hsl(152_70%_50%)] shadow-[0_0_14px_2px_hsl(152_80%_55%/0.7)]",
  warn: "bg-[hsl(38_85%_55%)] shadow-[0_0_14px_2px_hsl(38_85%_55%/0.7)]",
  crit: "bg-[hsl(0_85%_60%)] shadow-[0_0_14px_2px_hsl(0_85%_60%/0.7)]",
  idle: "bg-[hsl(42_25%_90%/0.25)]",
};

const textByStatus: Record<Status, string> = {
  ok: "text-[hsl(152_70%_60%)]",
  warn: "text-[hsl(38_85%_65%)]",
  crit: "text-[hsl(0_85%_70%)]",
  idle: "text-[hsl(42_25%_90%/0.45)]",
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
        "relative rounded-3xl border bg-gradient-to-b from-[hsl(30_18%_14%/0.95)] to-[hsl(30_22%_9%/0.95)] backdrop-blur-sm overflow-hidden transition-all",
        ringByStatus[status],
        className,
      )}
    >
      {/* inner highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(42_50%_85%/0.18)] to-transparent" />
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-7 pt-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn("h-2 w-2 rounded-full", dotByStatus[status])} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(42_30%_85%/0.55)] truncate">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[10px] tracking-[0.18em] uppercase text-[hsl(42_30%_85%/0.3)] truncate">
                · {subtitle}
              </span>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="p-7">{children}</div>
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(42_30%_85%/0.55)]">
            {label}
          </span>
          <span className={cn("h-2 w-2 rounded-full", dotByStatus[status])} />
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-[5rem] xl:text-[6.5rem] font-light tabular-nums leading-none text-[hsl(42_45%_94%)]"
            style={{ letterSpacing: "-0.04em" }}
          >
            {value}
          </span>
          {unit && (
            <span className="text-2xl font-light text-[hsl(42_30%_85%/0.4)] tabular-nums">{unit}</span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs pt-1 border-t border-[hsl(42_25%_90%/0.06)]">
          <span className={cn("font-medium tabular-nums uppercase tracking-wider text-[10px]", textByStatus[status])}>
            {delta ?? "—"}
          </span>
          {hint && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-[hsl(42_30%_85%/0.3)]">
              {hint}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}

function HealthRow({ label, value, status }: { label: string; value: string; status: Status }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-[hsl(42_25%_90%/0.05)] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotByStatus[status])} />
        <span className="text-[15px] text-[hsl(42_45%_94%/0.85)] truncate">{label}</span>
      </div>
      <span className={cn("text-[15px] font-medium tabular-nums", textByStatus[status])}>
        {value}
      </span>
    </div>
  );
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
      className="min-h-screen w-full text-[hsl(42_45%_94%)] antialiased overflow-hidden relative"
      style={{
        background:
          "radial-gradient(1200px 700px at 12% -10%, hsl(152 60% 22% / 0.35), transparent 60%), radial-gradient(900px 500px at 100% 5%, hsl(38 50% 35% / 0.18), transparent 60%), radial-gradient(800px 800px at 50% 110%, hsl(152 70% 30% / 0.18), transparent 70%), linear-gradient(180deg, hsl(28 22% 7%) 0%, hsl(28 22% 5%) 100%)",
      }}
    >
      {/* Champagne grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95  0 0 0 0 0.86  0 0 0 0 0.65  0 0 0 0.7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, hsl(28 22% 4% / 0.65) 100%)",
        }}
      />

      <div className="relative z-10 flex flex-col h-screen p-6 xl:p-9 gap-6">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-5">
            <div className="opacity-90">
              <IskraLogo size={30} textClass="text-base" />
            </div>
            <div className="h-7 w-px bg-[hsl(42_30%_85%/0.12)]" />
            <div className="flex items-center gap-2.5">
              <Radio className="h-4 w-4 text-[hsl(152_70%_55%)] animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[hsl(152_70%_70%)]">
                Live · Operations
              </span>
            </div>
            <div className="h-7 w-px bg-[hsl(42_30%_85%/0.12)]" />
            <h1
              className="font-display text-2xl xl:text-[1.85rem] font-light text-[hsl(42_45%_94%)]"
              style={{ letterSpacing: "-0.025em" }}
            >
              Mission Control
            </h1>
          </div>

          <div className="flex items-center gap-7">
            <div className="text-right leading-tight hidden md:block">
              <div className="text-[9px] uppercase tracking-[0.28em] text-[hsl(42_30%_85%/0.4)]">
                {formatDate(now)}
              </div>
              <div
                className="font-display text-3xl xl:text-[2.25rem] font-light tabular-nums text-[hsl(42_45%_94%)]"
                style={{ letterSpacing: "-0.03em" }}
              >
                {formatTime(now)}
              </div>
            </div>
            <div className="text-right leading-tight hidden lg:block">
              <div className="text-[9px] uppercase tracking-[0.28em] text-[hsl(42_30%_85%/0.4)]">
                Last update
              </div>
              <div className="text-xs tabular-nums text-[hsl(42_30%_85%/0.65)]">
                {formatTime(lastUpdated)} · next in {nextRefreshIn}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              className="border border-[hsl(42_30%_85%/0.12)] bg-[hsl(42_30%_85%/0.04)] hover:bg-[hsl(42_30%_85%/0.1)] text-[hsl(42_45%_94%)] rounded-full px-4"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-2", refreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFullscreen}
              className="border border-[hsl(42_30%_85%/0.12)] bg-[hsl(42_30%_85%/0.04)] hover:bg-[hsl(42_30%_85%/0.1)] text-[hsl(42_45%_94%)] rounded-full"
              aria-label="Toggle fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* Main grid */}
        <main className="grid flex-1 min-h-0 grid-cols-12 grid-rows-12 gap-6">
          {/* Hero KPIs */}
          <div className="col-span-12 row-span-5 grid grid-cols-2 xl:grid-cols-4 gap-6">
            <KpiCard label="Messages sent · 24h" value="—" hint="awaiting audit" />
            <KpiCard label="Reply rate · 24h" value="—" unit="%" hint="awaiting audit" />
            <KpiCard label="Positive leads · 24h" value="—" hint="awaiting audit" />
            <KpiCard label="Active campaigns" value="—" hint="awaiting audit" />
          </div>

          {/* Fleet & system health */}
          <Panel
            title="Fleet & System Health"
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
            <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-[hsl(42_30%_85%/0.3)] leading-relaxed">
              Indicators activate after data source confirmation
            </p>
          </Panel>

          {/* Live activity */}
          <Panel
            title="Live Activity"
            subtitle="campaigns & top clients"
            className="col-span-12 xl:col-span-5 row-span-7"
          >
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[280px] gap-4">
              <div className="relative">
                <div className="absolute inset-0 blur-2xl bg-[hsl(152_70%_50%/0.15)] rounded-full" />
                <Activity className="relative h-12 w-12 text-[hsl(152_70%_55%/0.55)]" />
              </div>
              <p
                className="font-display text-lg font-light text-[hsl(42_45%_94%/0.7)]"
                style={{ letterSpacing: "-0.02em" }}
              >
                Live campaign progress
              </p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[hsl(42_30%_85%/0.35)] max-w-[280px]">
                Wires up after the metrics audit
              </p>
            </div>
          </Panel>

          {/* Alerts */}
          <Panel
            title="Alerts & Incidents"
            status="ok"
            className="col-span-12 xl:col-span-3 row-span-7"
          >
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[280px] gap-4">
              <div className="relative">
                <div className="absolute inset-0 blur-3xl bg-[hsl(152_80%_55%/0.25)] rounded-full" />
                <CheckCircle2 className="relative h-14 w-14 text-[hsl(152_70%_55%)]" />
              </div>
              <div
                className="font-display text-2xl font-light text-[hsl(42_45%_94%)]"
                style={{ letterSpacing: "-0.025em" }}
              >
                All clear
              </div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[hsl(42_30%_85%/0.35)] max-w-[220px]">
                Incidents will surface here
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 w-full">
                {[
                  { label: "Crit", v: 0, c: "text-[hsl(0_85%_70%)]" },
                  { label: "Warn", v: 0, c: "text-[hsl(38_85%_65%)]" },
                  { label: "Info", v: 0, c: "text-[hsl(200_70%_70%)]" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[hsl(42_25%_90%/0.06)] bg-[hsl(42_30%_85%/0.02)] py-2.5 text-center"
                  >
                    <div className="text-[9px] uppercase tracking-[0.2em] text-[hsl(42_30%_85%/0.4)]">
                      {s.label}
                    </div>
                    <div
                      className={cn(
                        "font-display text-xl font-light tabular-nums",
                        s.c,
                      )}
                    >
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </main>

        {/* Footer */}
        <footer className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-[hsl(42_30%_85%/0.3)] shrink-0">
          <div>Pre-audit build · metric definitions to be locked</div>
          <div className="tabular-nums">Auto-refresh · 5 min</div>
        </footer>
      </div>
    </div>
  );
}

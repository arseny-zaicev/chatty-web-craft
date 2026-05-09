import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { RefreshCw, Activity, CheckCircle2, Radio, Maximize2, Link2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evaluateAdminAccess } from "@/lib/adminGuard";
import { IskraLoader } from "@/components/IskraLoader";
import { IskraLogo } from "@/components/IskraLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type Status = "ok" | "warn" | "crit" | "idle";

const ringByStatus: Record<Status, string> = {
  ok: "shadow-[0_8px_40px_-16px_hsl(152_65%_35%/0.35)] border-[hsl(152_65%_35%/0.35)]",
  warn: "shadow-[0_8px_40px_-16px_hsl(38_70%_45%/0.35)] border-[hsl(38_70%_45%/0.35)]",
  crit: "shadow-[0_8px_40px_-16px_hsl(0_70%_50%/0.35)] border-[hsl(0_70%_50%/0.4)]",
  idle: "shadow-[0_2px_16px_hsl(38_30%_70%/0.15)] border-[hsl(38_30%_80%)]",
};

const dotByStatus: Record<Status, string> = {
  ok: "bg-[hsl(152_65%_35%)] shadow-[0_0_10px_2px_hsl(152_70%_42%/0.4)]",
  warn: "bg-[hsl(38_70%_45%)] shadow-[0_0_10px_2px_hsl(38_70%_45%/0.4)]",
  crit: "bg-[hsl(0_70%_50%)] shadow-[0_0_10px_2px_hsl(0_70%_50%/0.4)]",
  idle: "bg-[hsl(28_18%_40%/0.35)]",
};

const textByStatus: Record<Status, string> = {
  ok: "text-[hsl(152_65%_30%)]",
  warn: "text-[hsl(38_75%_38%)]",
  crit: "text-[hsl(0_70%_45%)]",
  idle: "text-[hsl(28_18%_40%/0.6)]",
};

function Panel({
  children,
  className,
  title,
  subtitle,
  status = "idle",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  status?: Status;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-[hsl(42_40%_97%)] backdrop-blur-sm overflow-hidden flex flex-col transition-all",
        ringByStatus[status],
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 lg:px-6 pt-4 lg:pt-5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn("h-2 w-2 rounded-full shrink-0", dotByStatus[status])} />
            <h3 className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(28_18%_30%)] truncate">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[10px] tracking-[0.16em] uppercase text-[hsl(28_18%_40%/0.55)] truncate hidden sm:inline">
                · {subtitle}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="p-5 lg:p-6 flex-1 min-h-0">{children}</div>
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
    <Panel status={status}>
      <div className="flex flex-col gap-2 lg:gap-3 h-full justify-between min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(28_18%_30%)] truncate">
            {label}
          </span>
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotByStatus[status])} />
        </div>
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="font-display font-light tabular-nums leading-none text-[hsl(28_22%_11%)] truncate"
            style={{
              letterSpacing: "-0.04em",
              fontSize: "clamp(2.75rem, 6vw, 5.5rem)",
            }}
          >
            {value}
          </span>
          {unit && (
            <span className="text-lg lg:text-2xl font-light text-[hsl(28_18%_40%/0.6)] tabular-nums">
              {unit}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider gap-2 pt-2 border-t border-[hsl(38_25%_80%)]">
          <span className={cn("font-medium tabular-nums truncate", textByStatus[status])}>
            {delta ?? "—"}
          </span>
          {hint && (
            <span className="tracking-[0.18em] text-[hsl(28_18%_40%/0.5)] truncate">{hint}</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

function HealthRow({ label, value, status }: { label: string; value: string; status: Status }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 lg:py-3 border-b border-[hsl(38_25%_80%/0.7)] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn("h-2 w-2 rounded-full shrink-0", dotByStatus[status])} />
        <span className="text-[13px] lg:text-sm text-[hsl(28_22%_18%)] truncate">{label}</span>
      </div>
      <span className={cn("text-[13px] lg:text-sm font-medium tabular-nums shrink-0", textByStatus[status])}>
        {value}
      </span>
    </div>
  );
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function OpsLive() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token: tokenFromPath } = useParams<{ token?: string }>();
  const tokenParam = tokenFromPath ?? searchParams.get("token") ?? "";
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tokenMode, setTokenMode] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Token-based public access path
      if (tokenParam) {
        // Guard against placeholder URLs like /tv/:token
        const looksValid = /^[A-Za-z0-9_-]{6,}$/.test(tokenParam);
        if (!looksValid) {
          if (!mounted) return;
          setTokenError("This TV link is invalid. Generate a new one from the admin panel.");
          setAuthChecked(true);
          return;
        }
        try {
          const { data, error } = await supabase.functions.invoke("tv-token?action=verify", {
            body: { token: tokenParam },
          });
          if (!mounted) return;
          if (error || !data?.valid) {
            setTokenError("This TV link has expired or was revoked. Please generate a new one.");
            setAuthChecked(true);
            return;
          }
          setTokenMode(true);
          setAuthChecked(true);
          return;
        } catch {
          if (!mounted) return;
          setTokenError("Could not verify TV link. Please try again.");
          setAuthChecked(true);
          return;
        }
      }
      const [{ data: { session } }, r] = await Promise.all([
        supabase.auth.getSession(),
        evaluateAdminAccess(),
      ]);
      if (!mounted) return;
      if (!session || r.state === "redirect") {
        navigate(r.state === "redirect" ? r.to : "/admin-auth");
        return;
      }
      setIsAdmin(true);
      setAuthChecked(true);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate, tokenParam]);

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

  const handleGenerateLink = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("tv-token?action=create", {
        body: { days: 7, label: "Ops Live · TV" },
      });
      if (error || !data?.token) {
        toast.error(error?.message ?? "Failed to generate link");
        return;
      }
      const url = `${window.location.origin}/tv/${data.token}`;
      setGeneratedUrl(url);
      setCopied(false);
      toast.success("Link generated · valid 7 days");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
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

  if (tokenError) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(152_65%_28%)]">
            Ops Live · TV access
          </div>
          <h1 className="text-2xl font-semibold">Link unavailable</h1>
          <p className="text-sm text-muted-foreground">{tokenError}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      key={refreshKey}
      className="min-h-screen w-full bg-background text-foreground antialiased relative overflow-x-hidden"
      style={{
        backgroundImage:
          "radial-gradient(1100px 600px at 12% -10%, hsl(152 70% 42% / 0.10), transparent 60%), radial-gradient(900px 500px at 100% 5%, hsl(38 50% 42% / 0.08), transparent 60%)",
      }}
    >
      {/* Subtle grain (matches LP brand) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.18  0 0 0 0 0.13  0 0 0 0 0.06  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative z-10 flex flex-col min-h-screen xl:h-screen p-4 sm:p-6 xl:p-8 gap-4 lg:gap-6">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 shrink-0">
          <div className="flex items-center gap-3 lg:gap-5 min-w-0">
            <div className="shrink-0">
              <IskraLogo size={28} textClass="text-base" />
            </div>
            <div className="hidden sm:block h-6 w-px bg-[hsl(38_25%_60%/0.5)]" />
            <div className="hidden sm:flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-[hsl(152_65%_35%)] animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(152_65%_28%)]">
                Live · Operations{tokenMode ? " · View only" : ""}
              </span>
            </div>
            <div className="hidden md:block h-6 w-px bg-[hsl(38_25%_60%/0.5)]" />
            <h1
              className="font-display text-xl lg:text-2xl xl:text-[1.75rem] font-light text-[hsl(28_22%_11%)] truncate"
              style={{ letterSpacing: "-0.025em" }}
            >
              Mission Control
            </h1>
          </div>

          <div className="flex items-center gap-3 lg:gap-5">
            <div className="text-right leading-tight hidden md:block">
              <div className="text-[9px] uppercase tracking-[0.24em] text-[hsl(28_18%_40%/0.7)]">
                {formatDate(now)}
              </div>
              <div
                className="font-display text-2xl lg:text-3xl font-light tabular-nums text-[hsl(28_22%_11%)]"
                style={{ letterSpacing: "-0.03em" }}
              >
                {formatTime(now)}
              </div>
            </div>
            <div className="text-right leading-tight hidden xl:block">
              <div className="text-[9px] uppercase tracking-[0.24em] text-[hsl(28_18%_40%/0.7)]">
                Last update
              </div>
              <div className="text-[11px] tabular-nums text-[hsl(28_18%_30%/0.8)]">
                {formatTime(lastUpdated)} · next {nextRefreshIn}
              </div>
            </div>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLinkDialogOpen(true)}
                className="border border-[hsl(152_65%_35%/0.4)] bg-[hsl(152_65%_35%/0.06)] hover:bg-[hsl(152_65%_35%/0.12)] text-[hsl(152_65%_28%)] rounded-full px-3 lg:px-4 h-8"
              >
                <Link2 className="h-3.5 w-3.5 lg:mr-2" />
                <span className="hidden lg:inline">TV link</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              className="border border-[hsl(38_25%_70%)] bg-[hsl(40_40%_98%)] hover:bg-[hsl(40_40%_94%)] text-[hsl(28_22%_15%)] rounded-full px-3 lg:px-4 h-8"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 lg:mr-2", refreshing && "animate-spin")} />
              <span className="hidden lg:inline">Refresh</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFullscreen}
              className="border border-[hsl(38_25%_70%)] bg-[hsl(40_40%_98%)] hover:bg-[hsl(40_40%_94%)] text-[hsl(28_22%_15%)] rounded-full h-8 w-8"
              aria-label="Toggle fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {/* Main grid — fixed grid only on xl+, stacks on smaller screens */}
        <main className="flex-1 min-h-0 grid gap-4 lg:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 xl:grid-rows-12">
          {/* Hero KPIs */}
          <div className="xl:col-span-12 xl:row-span-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 sm:col-span-2">
            <KpiCard label="Messages sent · 24h" value="—" hint="awaiting audit" />
            <KpiCard label="Reply rate · 24h" value="—" unit="%" hint="awaiting audit" />
            <KpiCard label="Positive leads · 24h" value="—" hint="awaiting audit" />
            <KpiCard label="Active campaigns" value="—" hint="awaiting audit" />
          </div>

          {/* Fleet & system health */}
          <Panel title="Fleet & System Health" className="xl:col-span-4 xl:row-span-7 sm:col-span-2 xl:col-auto">
            <div className="flex flex-col h-full">
              <HealthRow label="WhatsApp numbers — active" value="—" status="idle" />
              <HealthRow label="Numbers — restricted" value="—" status="idle" />
              <HealthRow label="Numbers — blocked" value="—" status="idle" />
              <HealthRow label="Gupshup API" value="—" status="idle" />
              <HealthRow label="Slack dispatch queue" value="—" status="idle" />
              <HealthRow label="Inbox watcher" value="—" status="idle" />
              <p className="mt-auto pt-4 text-[10px] uppercase tracking-[0.18em] text-[hsl(28_18%_40%/0.5)]">
                Indicators activate after data audit
              </p>
            </div>
          </Panel>

          {/* Live activity */}
          <Panel
            title="Live Activity"
            subtitle="campaigns & top clients"
            className="xl:col-span-5 xl:row-span-7"
          >
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[200px] gap-3">
              <div className="relative">
                <div className="absolute inset-0 blur-2xl bg-[hsl(152_70%_42%/0.18)] rounded-full" />
                <Activity className="relative h-10 w-10 text-[hsl(152_65%_35%/0.7)]" />
              </div>
              <p
                className="font-display text-base lg:text-lg font-light text-[hsl(28_22%_18%)]"
                style={{ letterSpacing: "-0.02em" }}
              >
                Live campaign progress
              </p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(28_18%_40%/0.55)] max-w-[260px]">
                Wires up after the metrics audit
              </p>
            </div>
          </Panel>

          {/* Alerts */}
          <Panel title="Alerts & Incidents" status="ok" className="xl:col-span-3 xl:row-span-7">
            <div className="flex flex-col items-center justify-center text-center h-full min-h-[220px] gap-3">
              <div className="relative">
                <div className="absolute inset-0 blur-3xl bg-[hsl(152_70%_42%/0.25)] rounded-full" />
                <CheckCircle2 className="relative h-12 w-12 text-[hsl(152_65%_35%)]" />
              </div>
              <div
                className="font-display text-xl lg:text-2xl font-light text-[hsl(28_22%_11%)]"
                style={{ letterSpacing: "-0.025em" }}
              >
                All clear
              </div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(28_18%_40%/0.55)] max-w-[200px]">
                Incidents will surface here
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 w-full">
                {[
                  { label: "Crit", v: 0, c: "text-[hsl(0_70%_45%)]" },
                  { label: "Warn", v: 0, c: "text-[hsl(38_75%_38%)]" },
                  { label: "Info", v: 0, c: "text-[hsl(200_65%_38%)]" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[hsl(38_25%_80%)] bg-[hsl(40_40%_98%)] py-2 text-center"
                  >
                    <div className="text-[9px] uppercase tracking-[0.18em] text-[hsl(28_18%_40%/0.6)]">
                      {s.label}
                    </div>
                    <div className={cn("font-display text-lg font-light tabular-nums", s.c)}>
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </main>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-[hsl(28_18%_40%/0.55)] shrink-0">
          <div>Pre-audit build · metric definitions to be locked</div>
          <div className="tabular-nums">Auto-refresh · 5 min</div>
        </footer>
      </div>

      <Dialog open={linkDialogOpen} onOpenChange={(o) => { setLinkDialogOpen(o); if (!o) { setGeneratedUrl(null); setCopied(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Public TV link · 7 days</DialogTitle>
            <DialogDescription>
              Generate a read-only link to open Ops Live on a TV without signing in.
              Anyone with the link can view the wallboard until it expires.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            {!generatedUrl ? (
              <Button onClick={handleGenerateLink} disabled={generating} className="w-full">
                {generating ? "Generating…" : "Generate 7-day link"}
              </Button>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button onClick={handleCopy} variant="outline" size="icon" aria-label="Copy">
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Expires in 7 days. To revoke earlier, delete the token in the database.
                </p>
                <Button variant="ghost" size="sm" onClick={handleGenerateLink} disabled={generating} className="self-start">
                  Generate another
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

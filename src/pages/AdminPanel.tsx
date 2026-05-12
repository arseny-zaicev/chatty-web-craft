import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2, LogOut, Plus, Sparkles, Building2, Rocket, Inbox, Megaphone, FileText,
  Activity, ArrowRight, MessageSquare, Send, Calendar, AlertTriangle, CheckCircle2, BarChart3,
  Phone, LayoutDashboard, Clock, Globe, Users, Map as MapIcon, Wrench, DollarSign,
} from "lucide-react";
import { IskraLoader } from "@/components/IskraLoader";
import { User } from "@supabase/supabase-js";
import { AdminSubmissions } from "@/components/AdminSubmissions";
import { FormAnalyticsDashboard } from "@/components/FormAnalyticsDashboard";
import { SiteAnalytics } from "@/components/admin/SiteAnalytics";
import { WebhookHealth } from "@/components/admin/WebhookHealth";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { fetchPortfolioSnapshot, portfolioKeys, type PortfolioSnapshot } from "@/lib/portfolioMetrics";
import { Badge } from "@/components/ui/badge";

import { IskraLogo } from "@/components/IskraLogo";
import { cn } from "@/lib/utils";
import { evaluateAdminAccess } from "@/lib/adminGuard";
import { NewClientDialog } from "@/components/workspace/NewClientDialog";

const ADMIN_EMAIL = "arseny@iskra.ae";

type Section =
  | "companies.portfolio"
  | "companies.fleet"
  | "companies.bms"
  | "companies.analytics"
  | "companies.webhook_health"
  | "forms.submissions"
  | "forms.analytics"
  | "site.analytics"
  | "internal.roadmap"
  | "internal.assistant";

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { id: Section; label: string; icon: React.ComponentType<{ className?: string }>; external?: string }[];
};

const NAV: NavGroup[] = [
  {
    id: "companies", label: "Companies", icon: Building2,
    items: [
      { id: "companies.portfolio", label: "Portfolio", icon: LayoutDashboard },
      { id: "companies.fleet", label: "Fleet · Numbers", icon: Phone, external: "/admin/fleet" },
      { id: "companies.bms", label: "Business Managers", icon: Building2, external: "/admin/business-managers" },
      { id: "companies.analytics", label: "Fleet analytics", icon: BarChart3, external: "/admin/analytics" },
      { id: "companies.webhook_health", label: "Webhook health", icon: AlertTriangle },
    ],
  },
  {
    id: "forms", label: "Forms & Applicants", icon: FileText,
    items: [
      { id: "forms.submissions", label: "Submissions", icon: Users },
      { id: "forms.analytics", label: "Form analytics", icon: Activity },
    ],
  },
  {
    id: "site", label: "Site", icon: Globe,
    items: [
      { id: "site.analytics", label: "Site analytics", icon: BarChart3 },
    ],
  },
  {
    id: "internal", label: "Internal", icon: Wrench,
    items: [
      { id: "internal.roadmap", label: "Product roadmap", icon: MapIcon, external: "/admin/roadmap" },
      { id: "internal.assistant", label: "Ops Assistant", icon: Sparkles, external: "/admin/assistant" },
      { id: "internal.finance" as any, label: "Finance · Partners", icon: DollarSign, external: "/admin/finance/partners" },
    ],
  },
];

const AdminPanel = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [section, setSection] = useState<Section>("companies.portfolio");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let inFlight: Promise<void> | null = null;
    const check = () => {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        const [{ data: { session } }, r] = await Promise.all([
          supabase.auth.getSession(),
          evaluateAdminAccess(),
        ]);
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (r.state === "redirect") {
          if (r.reason === "not-admin") toast.error("Access denied. Admin only.");
          navigate(r.to);
        } else {
          setAuthChecked(true);
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Skip the redundant INITIAL_SESSION fire — our initial check() already covers it.
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "MFA_CHALLENGE_VERIFIED") check();
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [navigate]);

  const { data: workspaces, isLoading: wsLoading, refetch } = useQuery({
    queryKey: workspaceKeys.list,
    queryFn: fetchWorkspaces,
    enabled: authChecked,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-auth");
  };

  if (!authChecked) {
    return <IskraLoader message="Unlocking the admin console…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center">
              <IskraLogo size={32} textClass="text-base" />
            </Link>
            <div className="w-px h-5 bg-border" />
            <div className="text-xs">
              <div className="font-medium">Admin console</div>
              <div className="text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 grid grid-cols-12 gap-8">
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <nav className="space-y-6 sticky top-24">
            {NAV.map((group) => (
              <div key={group.id}>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 px-2 mb-2 flex items-center gap-1.5">
                  <group.icon className="w-3 h-3" />{group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = section === item.id;
                    const className = cn(
                      "w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded-md transition-colors",
                      active
                        ? "bg-foreground/[0.06] text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]",
                    );
                    if (item.external) {
                      return (
                        <Link key={item.id} to={item.external} className={className}>
                          <item.icon className="w-3.5 h-3.5" />{item.label}
                          <ArrowRight className="w-3 h-3 ml-auto opacity-50" />
                        </Link>
                      );
                    }
                    return (
                      <button key={item.id} onClick={() => setSection(item.id)} className={className}>
                        <item.icon className="w-3.5 h-3.5" />{item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="col-span-12 md:col-span-9 lg:col-span-10 min-w-0">
          {section === "companies.portfolio" && (
            <WorkspacesDashboard workspaces={workspaces ?? []} isLoading={wsLoading} onRefetch={() => refetch()} />
          )}
          {section === "forms.submissions" && <AdminSubmissions />}
          {section === "forms.analytics" && <FormAnalyticsDashboard />}
          {section === "site.analytics" && <SiteAnalytics />}
          {section === "companies.webhook_health" && <WebhookHealth />}
        </main>
      </div>
    </div>
  );
};

function WorkspacesDashboard({ workspaces, isLoading }: { workspaces: Workspace[]; isLoading: boolean; onRefetch: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const { data: snapshot } = useQuery<PortfolioSnapshot>({
    queryKey: portfolioKeys.snapshot,
    queryFn: fetchPortfolioSnapshot,
    staleTime: 2 * 60_000,
    // Slowed from 60s -> 5min and paused while the tab is hidden. The query reads every
    // conversation + every today-message in the org; constant polling is the dominant DB load.
    refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "hidden" ? false : 5 * 60_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const t = snapshot?.totals;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold">Portfolio</h2>
          <p className="text-sm text-muted-foreground">All clients at a glance. Open any folder to manage their inbox, launches and reporting.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" />New client
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi icon={Building2} label="Clients" value={t?.clients ?? workspaces.length} />
        <Kpi icon={Megaphone} label="Active campaigns" value={t?.active_campaigns ?? 0} />
        <Kpi icon={MessageSquare} label="Unread replies" value={t?.unread_replies ?? 0} accent={t && t.unread_replies > 0 ? "text-emerald-500" : undefined} />
        <Kpi icon={Send} label="Delivered today" value={t?.delivered_today ?? 0} />
        <Kpi icon={MessageSquare} label="Replies today" value={t?.replies_today ?? 0} />
        <Kpi icon={Calendar} label="Booked today" value={t?.booked_calls_today ?? 0} />
        <Kpi icon={AlertTriangle} label="Issues" value={t?.issues ?? 0} accent={t && t.issues > 0 ? "text-amber-500" : undefined} />
      </div>

      {workspaces.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="mb-4">No clients yet</p>
            <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-2" />Create first client</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => <ClientCard key={w.id} ws={w} m={snapshot?.byWorkspace[w.id]} />)}
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-lg border border-dashed border-border bg-card/30 hover:border-primary/50 hover:bg-card/50 transition-colors min-h-[260px] flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Plus className="h-5 w-5" /></div>
            <span className="text-sm font-medium">Add client</span>
          </button>
        </div>
      )}

      <NewClientDialog open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}

const HEALTH_META = {
  running:   { label: "Active",              cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",  icon: CheckCircle2 },
  scheduled: { label: "Active",              cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",  icon: CheckCircle2 },
  idle:      { label: "Active",              cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",  icon: CheckCircle2 },
  attention: { label: "Attention",           cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",        icon: AlertTriangle },
  blocked:   { label: "No active numbers",   cls: "bg-red-500/10 text-red-600 border-red-500/30",              icon: AlertTriangle },
} as const;

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ClientCard({ ws, m }: { ws: Workspace; m: PortfolioSnapshot["byWorkspace"][string] | undefined }) {
  const H = HEALTH_META[m?.health ?? "idle"];
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ws.name);
  const [code, setCode] = useState(ws.internal_code ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(ws.name); setCode(ws.internal_code ?? ""); }, [ws.name, ws.internal_code]);

  const saveName = async () => {
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase().slice(0, 6);
    if (!trimmedName) { setEditing(false); setName(ws.name); setCode(ws.internal_code ?? ""); return; }
    if (trimmedName === ws.name && trimmedCode === (ws.internal_code ?? "")) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase.from("workspaces").update({ name: trimmedName, internal_code: trimmedCode || null }).eq("id", ws.id);
    setSaving(false);
    if (error) { toast.error(error.message); setName(ws.name); setCode(ws.internal_code ?? ""); }
    else { toast.success("Renamed"); }
    setEditing(false);
  };

  const cancelEdit = () => { setEditing(false); setName(ws.name); setCode(ws.internal_code ?? ""); };

  const unread = m?.unread_replies ?? 0;
  const numbersActive = m?.numbers_active ?? 0;
  const numbersTotal = m?.numbers_total ?? 0;
  const displayName = ws.internal_code ? `${ws.name}-${ws.internal_code}` : ws.name;

  return (
    <Card className="group hover:border-primary/50 transition-colors flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: ws.color }} />
            {editing ? (
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") cancelEdit(); }}
                  disabled={saving}
                  placeholder="Brand"
                  className="text-base font-semibold bg-transparent border-b border-primary/40 focus:outline-none focus:border-primary px-0.5 min-w-0 flex-1"
                />
                <span className="text-base font-semibold text-muted-foreground">-</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  onBlur={saveName}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") cancelEdit(); }}
                  disabled={saving}
                  placeholder="CODE"
                  className="text-base font-semibold bg-transparent border-b border-primary/40 focus:outline-none focus:border-primary px-0.5 w-16 uppercase tracking-wider"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-base font-semibold truncate text-left hover:text-primary transition-colors"
                title="Click to rename (Brand-CODE)"
              >
                {displayName}
              </button>
            )}
          </div>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${H.cls}`}>
            <H.icon className="w-3 h-3 mr-1" />{H.label}
          </Badge>
        </div>
        <CardDescription className="text-xs">/{ws.slug}</CardDescription>
      </CardHeader>

      <ClientSettingsRow ws={ws} />

      <CardContent className="space-y-3 flex-1 flex flex-col">
        {/* Headline metric: campaign info */}
        <div className="rounded-md border border-border bg-card/40 p-3">
          {m?.health === "blocked" ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle className="w-3.5 h-3.5" />No active numbers</div>
              <div className="font-medium text-sm mt-0.5">Connect a WhatsApp number first</div>
              <div className="text-xs text-muted-foreground mt-1">{numbersTotal === 0 ? "No numbers added yet" : `${numbersTotal} number${numbersTotal === 1 ? "" : "s"} present, none active`}</div>
            </>
          ) : m?.health === "attention" && !m?.active_campaign_name ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle className="w-3.5 h-3.5" />Replies piling up</div>
              <div className="font-medium text-sm mt-0.5">{unread} unread message{unread === 1 ? "" : "s"}</div>
              <div className="text-xs text-muted-foreground mt-1">Open inbox to handle them</div>
            </>
          ) : m?.active_campaign_name ? (
            (() => {
              const sent = m.active_campaign_sent ?? 0;
              const total = m.active_campaign_total ?? 0;
              const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;
              const sendingNow = !!m.is_sending_now;
              const isRunning = m.active_campaign_status === "running";
              const label = sendingNow ? "Sending now" : isRunning ? "Campaign running" : "Next campaign";
              const Icon = sendingNow ? Rocket : isRunning ? CheckCircle2 : Calendar;
              return (
                <>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
                  <div className="font-medium text-sm mt-0.5 truncate">{m.active_campaign_name}</div>
                  {total > 0 && (
                    <>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {pct}% sent · {sent.toLocaleString()}/{total.toLocaleString()}
                        {isRunning ? ` · ${m.delivered_today ?? 0} today` : m.next_launch ? ` · starts ${formatDateShort(m.next_launch)}` : ""}
                      </div>
                    </>
                  )}
                  {total === 0 && m.next_launch && (
                    <div className="text-xs text-muted-foreground mt-1">Starts {formatDateShort(m.next_launch)}</div>
                  )}
                </>
              );
            })()
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" />No campaign scheduled</div>
              <div className="font-medium text-sm mt-0.5">{numbersActive} active number{numbersActive === 1 ? "" : "s"} ready</div>
              <div className="text-xs text-muted-foreground mt-1">Plan a launch when you're ready</div>
            </>
          )}
        </div>

        {/* Compact secondary stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Numbers" value={`${numbersActive}/${numbersTotal}`} />
          <MiniStat label="Unread" value={unread} highlight={unread > 0} />
          <MiniStat label="Sent today" value={m?.delivered_today ?? 0} />
        </div>

        <div className="flex items-center gap-2 mt-auto">
          <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5">
            <Link to={`/ws/${ws.slug}/inbox`}>
              <Inbox className="h-3.5 w-3.5" />Inbox{unread > 0 ? ` (${unread})` : ""}
            </Link>
          </Button>
          <Button asChild variant="default" size="sm" className="flex-1 gap-1.5">
            <Link to={`/ws/${ws.slug}/launch`}>
              <Rocket className="h-3.5 w-3.5" />Launch
            </Link>
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          onClick={() => navigate(`/ws/${ws.slug}/overview`)}
        >
          Open workspace<ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

const Kpi = ({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; accent?: string }) => (
  <div className="rounded-lg border border-border bg-card/30 p-3">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
    <div className={`text-2xl font-display font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
  </div>
);

const MiniStat = ({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) => (
  <div className="rounded-md border border-border bg-card/40 py-1.5">
    <div className={`font-display font-semibold text-base ${highlight ? "text-emerald-500" : ""}`}>{value}</div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
  </div>
);

function ClientSettingsRow({ ws }: { ws: Workspace }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(ws.slug);
  const [channel, setChannel] = useState(ws.slack_channel_id ?? "");
  const [enabled, setEnabled] = useState(!!ws.inbox_alerts_enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSlug(ws.slug);
    setChannel(ws.slack_channel_id ?? "");
    setEnabled(!!ws.inbox_alerts_enabled);
  }, [ws.slug, ws.slack_channel_id, ws.inbox_alerts_enabled]);

  const save = async () => {
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "").slice(0, 32);
    const cleanChannel = channel.trim() || null;
    if (!cleanSlug) { toast.error("Slug required"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ slug: cleanSlug, slack_channel_id: cleanChannel, inbox_alerts_enabled: enabled })
      .eq("id", ws.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="px-6 -mt-1 mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <button type="button" onClick={() => setOpen(true)} className="hover:text-primary underline-offset-2 hover:underline">
          Settings
        </button>
        {ws.inbox_alerts_enabled && <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />alerts on</span>}
        {ws.slack_channel_id && <span className="truncate">· #{ws.slack_channel_id.slice(0, 11)}</span>}
      </div>
    );
  }

  return (
    <div className="px-6 -mt-1 mb-2 space-y-2 rounded-md bg-muted/30 py-2">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">URL slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="iskra-is"
          className="w-full text-sm bg-background border border-border rounded px-2 py-1 mt-0.5"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Slack channel ID</label>
        <input
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="C0XXXXXXXX"
          className="w-full text-sm bg-background border border-border rounded px-2 py-1 mt-0.5 font-mono"
        />
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-primary" />
        Inbox alerts enabled (positive leads + unread spike)
      </label>
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

export default AdminPanel;

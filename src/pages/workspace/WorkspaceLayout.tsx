import { Link, Outlet, useLocation, useNavigate, useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { ChevronRight, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceRole, isManagerLike } from "@/lib/workspaceRole";
import { IskraLoader } from "@/components/IskraLoader";

const ADMIN_EMAIL = "arseny@iskra.ae";

export type WorkspaceContext = { workspace: Workspace };

const WorkspaceMainFallback = () => <IskraLoader fullscreen={false} />;

export default function WorkspaceLayout() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const guard = async (uid?: string | null, email?: string | null) => {
      if (!uid) {
        navigate("/portal-auth", { replace: true });
        return;
      }
      // Admin always passes
      if (email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        if (!cancelled) setAuthChecked(true);
        return;
      }
      // Otherwise must be a member of at least one workspace
      const { count } = await supabase
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid);
      if (cancelled) return;
      if (!count || count === 0) {
        await supabase.auth.signOut();
        toast.error("No workspace access. Ask your account manager to invite you.");
        navigate("/portal-auth", { replace: true });
        return;
      }
      setAuthChecked(true);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      guard(session?.user?.id, session?.user?.email);
    });
    supabase.auth.getSession().then(({ data: { session } }) => guard(session?.user?.id, session?.user?.email));
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [navigate]);

  const { data, isLoading } = useQuery({ queryKey: workspaceKeys.list, queryFn: fetchWorkspaces, enabled: authChecked });


  const workspace = data?.find((w) => w.slug === slug);
  const location = useLocation();
  const sectionLabel = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean); // ["ws", slug, section?]
    const seg = parts[2];
    if (!seg || seg === "overview") return "Overview";
    const map: Record<string, string> = { inbox: "Inbox", pipeline: "Pipeline", campaigns: "Campaigns", launch: "Launch", library: "Library", settings: "Settings" };
    return map[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
  }, [location.pathname]);

  useEffect(() => {
    if (!slug && data && data.length > 0) navigate(`/ws/${data[0].slug}/overview`, { replace: true });
  }, [slug, data, navigate]);

  if (!authChecked) {
    return <IskraLoader message="Opening your workspace…" />;
  }

  return (
    <>
      <Helmet><title>Iskra Workspaces</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <SidebarProvider>
        <div className="h-screen flex w-full bg-background text-foreground overflow-hidden">
          <WorkspaceSidebar />
          <div className="flex-1 flex flex-col min-w-0 min-h-0 h-screen">
            <WorkspaceHeader workspace={workspace} slug={slug} sectionLabel={sectionLabel} />
            <main className="flex-1 min-h-0 overflow-hidden">
              {isLoading ? (
                <WorkspaceMainFallback />
              ) : (
                <Suspense fallback={<WorkspaceMainFallback />}>
                  <RoleGuardedOutlet workspace={workspace} />
                </Suspense>
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

function WorkspaceHeader({ workspace, slug, sectionLabel }: { workspace?: Workspace; slug?: string; sectionLabel: string }) {
  const navigate = useNavigate();
  const { data: role } = useWorkspaceRole(workspace?.id);
  const isClient = role === "client";
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/portal-auth", { replace: true });
  };
  return (
    <header className="h-12 shrink-0 px-3 border-b border-border flex items-center gap-2 bg-card/40">
      <SidebarTrigger />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
        {!isClient && <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">Clients</Link>}
        {workspace && (
          <>
            {!isClient && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            <Link to={`/ws/${workspace.slug}/overview`} className="flex items-center gap-1.5 min-w-0 hover:text-foreground transition-colors text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: workspace.color }} />
              <span className="truncate">{workspace.name}</span>
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-display truncate text-foreground">{sectionLabel}</span>
          </>
        )}
        {!workspace && <span className="font-display truncate ml-1">{slug === "new" ? "New client" : "Workspaces"}</span>}
      </nav>
      {isClient && (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-[10px]">Client view</Badge>
      )}
      <Button variant="ghost" size="sm" onClick={handleSignOut} title="Sign out">
        <LogOut className="w-4 h-4" />
      </Button>
    </header>
  );
}

function RoleGuardedOutlet({ workspace }: { workspace?: Workspace }) {
  const location = useLocation();
  const { data: role, isLoading } = useWorkspaceRole(workspace?.id);
  if (!workspace) return <Outlet context={{ workspace }} />;
  if (isLoading) return <WorkspaceMainFallback />;
  const seg = location.pathname.split("/").filter(Boolean)[2];
  const restricted = seg === "library" || seg === "settings" || seg === "launch" || seg === "data";
  if (restricted && !isManagerLike(role)) {
    return <Navigate to={`/ws/${workspace.slug}/overview`} replace />;
  }
  return <Outlet context={{ workspace } satisfies Partial<WorkspaceContext>} />;
}

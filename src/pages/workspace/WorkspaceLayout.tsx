import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ADMIN_EMAIL = "arseny@iskra.ae";

export type WorkspaceContext = { workspace: Workspace };

const WorkspaceMainFallback = () => (
  <div className="h-full flex items-start justify-center p-10">
    <div className="flex items-center gap-3 rounded-md border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-sm">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Loading workspace...
    </div>
  </div>
);

export default function WorkspaceLayout() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const guard = (email?: string | null) => {
      if (!email) {
        navigate("/admin-auth", { replace: true });
        return;
      }
      if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        supabase.auth.signOut();
        toast.error("Access denied. Admin only.");
        navigate("/admin-auth", { replace: true });
        return;
      }
      setAuthChecked(true);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => guard(session?.user?.email));
    supabase.auth.getSession().then(({ data: { session } }) => guard(session?.user?.email));
    return () => subscription.unsubscribe();
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Iskra Workspaces</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <SidebarProvider>
        <div className="h-screen flex w-full bg-background text-foreground overflow-hidden">
          <WorkspaceSidebar />
          <div className="flex-1 flex flex-col min-w-0 min-h-0 h-screen">
            <header className="h-12 shrink-0 px-3 border-b border-border flex items-center gap-2 bg-card/40">
              <SidebarTrigger />
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
                <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">Clients</Link>
                {workspace && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
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
            </header>
            <main className="flex-1 min-h-0 overflow-hidden">
              {isLoading ? (
                <WorkspaceMainFallback />
              ) : (
                <Suspense fallback={<WorkspaceMainFallback />}>
                  <Outlet context={{ workspace } satisfies Partial<WorkspaceContext>} />
                </Suspense>
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

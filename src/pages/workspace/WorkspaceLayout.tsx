import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ADMIN_EMAIL = "arseny@iskra.ae";

export type WorkspaceContext = { workspace: Workspace };

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
            <header className="h-12 shrink-0 px-3 border-b border-border flex items-center gap-3 bg-card/40">
              <SidebarTrigger />
              <Button asChild variant="ghost" size="sm" className="gap-1 h-8 px-2">
                <Link to="/admin"><ArrowLeft className="w-4 h-4" />Admin</Link>
              </Button>
              <div className="w-px h-5 bg-border" />
              <div className="flex items-center gap-2 min-w-0">
                {workspace && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: workspace.color }} />}
                <h1 className="font-display text-sm truncate">{workspace?.name ?? (slug === "new" ? "New client" : "Workspaces")}</h1>
              </div>
            </header>
            <main className="flex-1 min-h-0 overflow-hidden">
              {isLoading ? (
                <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <Outlet context={{ workspace } satisfies Partial<WorkspaceContext>} />
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

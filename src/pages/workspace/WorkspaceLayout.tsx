import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkspaceContext = { workspace: Workspace };

export default function WorkspaceLayout() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: workspaceKeys.list, queryFn: fetchWorkspaces });

  const workspace = data?.find((w) => w.slug === slug);

  useEffect(() => {
    if (!slug && data && data.length > 0) navigate(`/ws/${data[0].slug}/inbox`, { replace: true });
  }, [slug, data, navigate]);

  return (
    <>
      <Helmet><title>Iskra Workspaces</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <WorkspaceSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-12 px-3 border-b border-border flex items-center gap-3 bg-card/40">
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
            <main className="flex-1 min-h-0 overflow-auto">
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

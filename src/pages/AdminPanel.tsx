import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2, LogOut, Plus, Sparkles, Building2, Rocket, Inbox, KanbanSquare, Megaphone, FileText,
  Activity, ArrowRight, MessageSquare, Send, Calendar, AlertTriangle, CheckCircle2, BarChart3,
  Phone, LayoutDashboard, Clock,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import { AdminSubmissions } from "@/components/AdminSubmissions";
import { FormAnalyticsDashboard } from "@/components/FormAnalyticsDashboard";
import { fetchWorkspaces, workspaceKeys, type Workspace } from "@/lib/workspaces";
import { fetchPortfolioSnapshot, portfolioKeys, type PortfolioSnapshot } from "@/lib/portfolioMetrics";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const ADMIN_EMAIL = "arseny@iskra.ae";

type Tab = "workspaces" | "submissions" | "analytics";

const AdminPanel = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("workspaces");
  const navigate = useNavigate();

  useEffect(() => {
    const guard = (currentUser: User | null) => {
      setUser(currentUser);
      if (!currentUser) {
        navigate("/admin-auth");
      } else if (currentUser.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        supabase.auth.signOut();
        navigate("/admin-auth");
        toast.error("Access denied. Admin only.");
      } else {
        setAuthChecked(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => guard(session?.user ?? null));
    supabase.auth.getSession().then(({ data: { session } }) => guard(session?.user ?? null));
    return () => subscription.unsubscribe();
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-iskra-emerald to-iskra-emerald/70 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight">ISKRA</span>
            </Link>
            <div className="w-px h-6 bg-border" />
            <div>
              <h1 className="text-base font-display font-bold leading-tight">Admin</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />Sign out
          </Button>
        </div>
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 border-t pt-2 pb-2">
            <TabBtn active={activeTab === "workspaces"} onClick={() => setActiveTab("workspaces")} icon={<Building2 className="h-4 w-4" />}>Workspaces</TabBtn>
            <TabBtn active={activeTab === "submissions"} onClick={() => setActiveTab("submissions")} icon={<FileText className="h-4 w-4" />}>Submissions</TabBtn>
            <TabBtn active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} icon={<Activity className="h-4 w-4" />}>Form Analytics</TabBtn>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {activeTab === "submissions" && <AdminSubmissions />}
        {activeTab === "analytics" && <FormAnalyticsDashboard />}
        {activeTab === "workspaces" && (
          <WorkspacesDashboard workspaces={workspaces ?? []} isLoading={wsLoading} onRefetch={() => refetch()} />
        )}
      </main>
    </div>
  );
};

const TabBtn = ({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <Button variant={active ? "default" : "ghost"} size="sm" onClick={onClick} className="gap-2">{icon}{children}</Button>
);

function WorkspacesDashboard({ workspaces, isLoading, onRefetch }: { workspaces: { id: string; name: string; slug: string; color: string }[]; isLoading: boolean; onRefetch: () => void }) {
  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Clients (workspaces)</h2>
          <p className="text-sm text-muted-foreground">One workspace per client. Open it to manage their inbox, pipeline and campaigns.</p>
        </div>
        <Button asChild>
          <Link to="/ws/new"><Plus className="h-4 w-4 mr-2" />New client</Link>
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="mb-4">No clients yet</p>
            <Button asChild><Link to="/ws/new"><Plus className="h-4 w-4 mr-2" />Create first client</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => (
            <Card key={w.id} className="group hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: w.color }} />
                  <CardTitle className="text-lg truncate">{w.name}</CardTitle>
                </div>
                <CardDescription className="text-xs">/{w.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <QuickLink to={`/ws/${w.slug}/inbox`} icon={<Inbox className="h-3.5 w-3.5" />} label="Inbox" />
                  <QuickLink to={`/ws/${w.slug}/pipeline`} icon={<KanbanSquare className="h-3.5 w-3.5" />} label="Pipeline" />
                  <QuickLink to={`/ws/${w.slug}/campaigns`} icon={<Megaphone className="h-3.5 w-3.5" />} label="Campaigns" />
                  <QuickLink to={`/ws/${w.slug}/launch`} icon={<Rocket className="h-3.5 w-3.5" />} label="Launch" primary />
                </div>
                <Button asChild variant="ghost" size="sm" className="w-full justify-between mt-1">
                  <Link to={`/ws/${w.slug}/inbox`}>Open workspace<ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed flex items-center justify-center hover:border-primary/50 transition-colors min-h-[200px]">
            <Button asChild variant="ghost" className="h-auto flex-col gap-2 py-8">
              <Link to="/ws/new">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Plus className="h-5 w-5" /></div>
                <span>Add client</span>
              </Link>
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

const QuickLink = ({ to, icon, label, primary }: { to: string; icon: React.ReactNode; label: string; primary?: boolean }) => (
  <Button asChild variant={primary ? "default" : "outline"} size="sm" className="gap-1.5 h-8 text-xs justify-start">
    <Link to={to}>{icon}{label}</Link>
  </Button>
);

export default AdminPanel;

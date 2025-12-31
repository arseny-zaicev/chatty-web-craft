import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogOut, ArrowLeft, Phone, PhoneCall, PhoneOff, PhoneMissed, TrendingUp, Users, BarChart3 } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

interface ClientData {
  id: string;
  company_name: string | null;
}

interface LeadRow {
  id: string;
  data: Record<string, string>;
  created_at: string;
}

const CALL_STATUS_COLORS: Record<string, string> = {
  "Not Called": "#6b7280",
  "Answered": "#22c55e",
  "Not Answered": "#ef4444",
  "Call Back": "#eab308",
};

const ClientStats = () => {
  const [user, setUser] = useState<User | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/client-auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/client-auth");
      } else {
        fetchClientData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchClientData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, company_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Failed to load account data");
        setIsLoading(false);
        return;
      }

      setClientData(data);
      await fetchLeads(data.id, userId);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLeads = async (clientId: string, userId: string) => {
    try {
      const { data, error } = await supabase
        .from("client_leads")
        .select("id, data, created_at")
        .eq("client_id", clientId)
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching leads:", error);
        return;
      }

      const rows: LeadRow[] = (data || []).map((row) => ({
        id: row.id,
        data: (row.data as Record<string, string>) || {},
        created_at: row.created_at,
      }));

      setLeads(rows);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/client-auth");
  };

  // Calculate statistics
  const totalLeads = leads.length;
  const statusCounts = leads.reduce((acc, lead) => {
    const status = lead.data["Call Status"] || "Not Called";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const answeredCount = statusCounts["Answered"] || 0;
  const notAnsweredCount = statusCounts["Not Answered"] || 0;
  const callBackCount = statusCounts["Call Back"] || 0;
  const notCalledCount = statusCounts["Not Called"] || 0;
  const calledLeads = answeredCount + notAnsweredCount + callBackCount;
  const callRate = totalLeads > 0 ? Math.round((calledLeads / totalLeads) * 100) : 0;
  const answerRate = calledLeads > 0 ? Math.round((answeredCount / calledLeads) * 100) : 0;

  // Data for pie chart
  const pieData = [
    { name: "Answered", value: answeredCount, color: CALL_STATUS_COLORS["Answered"] },
    { name: "Not Answered", value: notAnsweredCount, color: CALL_STATUS_COLORS["Not Answered"] },
    { name: "Call Back", value: callBackCount, color: CALL_STATUS_COLORS["Call Back"] },
    { name: "Not Called", value: notCalledCount, color: CALL_STATUS_COLORS["Not Called"] },
  ].filter(item => item.value > 0);

  // Data for activity by day (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  const activityByDay = last7Days.map(dateStr => {
    const dayLeads = leads.filter(lead => {
      const leadDate = lead.data["Last Call Date"];
      if (!leadDate) return false;
      // Parse date like "31.12.2024" or "12/31/2024"
      const parts = leadDate.split(/[./-]/);
      if (parts.length < 3) return false;
      const parsed = parts[0].length === 4 
        ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
        : `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      return parsed === dateStr;
    });

    const date = new Date(dateStr);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

    return {
      day: dayName,
      calls: dayLeads.length,
      answered: dayLeads.filter(l => l.data["Call Status"] === "Answered").length,
    };
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ISKRA Logo Component
  const IskraLogo = () => (
    <div className="flex items-center gap-2">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
        <path d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9L12 2Z" fill="currentColor"/>
      </svg>
      <span className="font-display text-lg font-bold tracking-tight text-foreground">ISKRA</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* ISKRA Logo */}
            <Link to="/" target="_blank">
              <IskraLogo />
            </Link>
            <div className="flex items-center gap-3 border-l pl-4">
              <Link to="/client-portal">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-base md:text-lg font-display font-bold">
                  Statistics
                </h1>
                <p className="text-xs text-muted-foreground">
                  {clientData?.company_name || "Your Performance"}
                </p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalLeads}</p>
                  <p className="text-xs text-muted-foreground">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Phone className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{callRate}%</p>
                  <p className="text-xs text-muted-foreground">Called</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <PhoneCall className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{answerRate}%</p>
                  <p className="text-xs text-muted-foreground">Answer Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <PhoneMissed className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{callBackCount}</p>
                  <p className="text-xs text-muted-foreground">Call Backs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Status Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Call Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data yet
                </div>
              )}
              
              {/* Legend */}
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm">{item.name}: {item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activity Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Activity (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityByDay}>
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="calls" name="Total Calls" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="answered" name="Answered" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Not Called", count: notCalledCount, icon: Phone, color: "bg-gray-400" },
                { label: "Answered", count: answeredCount, icon: PhoneCall, color: "bg-green-500" },
                { label: "Not Answered", count: notAnsweredCount, icon: PhoneOff, color: "bg-red-500" },
                { label: "Call Back", count: callBackCount, icon: PhoneMissed, color: "bg-yellow-500" },
              ].map((item) => {
                const percentage = totalLeads > 0 ? Math.round((item.count / totalLeads) * 100) : 0;
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${item.color}/20`}>
                      <item.icon className={`h-4 w-4 ${item.color.replace('bg-', 'text-')}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="text-sm text-muted-foreground">{item.count} ({percentage}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${item.color} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ClientStats;
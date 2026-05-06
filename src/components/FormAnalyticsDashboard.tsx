import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingDown, Users, CheckCircle2, XCircle } from "lucide-react";

interface FunnelStep {
  stepNumber: number;
  stepName: string;
  views: number;
  completions: number;
  dropoffRate: number;
}

interface FormFunnel {
  formType: string;
  totalSessions: number;
  completedSessions: number;
  conversionRate: number;
  steps: FunnelStep[];
}

const FORM_LABELS: Record<string, string> = {
  qualification: "Qualification",
  seller_leads: "Seller Leads",
  whatsapp_outreach: "WhatsApp Outreach",
  bm_access: "BM Access",
  demo_request: "Demo Request",
};

export const FormAnalyticsDashboard = () => {
  const [funnels, setFunnels] = useState<FormFunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("form_analytics")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching analytics:", error);
        return;
      }

      // Process data into funnels
      const formTypes = [...new Set(data?.map((d) => d.form_type) || [])];
      const processedFunnels: FormFunnel[] = [];

      for (const formType of formTypes) {
        const formData = data?.filter((d) => d.form_type === formType) || [];
        
        // Get unique sessions
        const sessions = [...new Set(formData.map((d) => d.session_id))];
        const completedSessions = sessions.filter((sessionId) =>
          formData.some(
            (d) => d.session_id === sessionId && d.event_type === "form_submitted"
          )
        );

        // Group by step
        const stepMap = new Map<number, { name: string; views: Set<string>; completions: Set<string> }>();
        
        formData.forEach((event) => {
          if (!stepMap.has(event.step_number)) {
            stepMap.set(event.step_number, {
              name: event.step_name,
              views: new Set(),
              completions: new Set(),
            });
          }
          
          const step = stepMap.get(event.step_number)!;
          if (event.event_type === "step_viewed") {
            step.views.add(event.session_id);
          } else if (event.event_type === "step_completed") {
            step.completions.add(event.session_id);
          }
        });

        // Convert to array and calculate dropoff
        const steps: FunnelStep[] = [];
        const sortedSteps = [...stepMap.entries()].sort((a, b) => a[0] - b[0]);
        
        sortedSteps.forEach(([stepNumber, stepData], index) => {
          const views = stepData.views.size;
          const completions = stepData.completions.size;
          const dropoffRate = views > 0 ? Math.round(((views - completions) / views) * 100) : 0;
          
          steps.push({
            stepNumber,
            stepName: stepData.name,
            views,
            completions,
            dropoffRate,
          });
        });

        processedFunnels.push({
          formType,
          totalSessions: sessions.length,
          completedSessions: completedSessions.length,
          conversionRate: sessions.length > 0 
            ? Math.round((completedSessions.length / sessions.length) * 100) 
            : 0,
          steps,
        });
      }

      setFunnels(processedFunnels);
    } catch (error) {
      console.error("Error processing analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (funnels.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <TrendingDown className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No analytics data yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Data will appear here once users start interacting with forms
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {funnels.map((funnel) => (
          <Card key={funnel.formType}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {FORM_LABELS[funnel.formType] || funnel.formType}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{funnel.conversionRate}%</span>
                <span className="text-sm text-muted-foreground">conversion</span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span>{funnel.totalSessions} started</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span>{funnel.completedSessions} completed</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Funnels */}
      {funnels.map((funnel) => (
        <Card key={funnel.formType}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              {FORM_LABELS[funnel.formType] || funnel.formType} Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnel.steps.map((step, index) => {
                const maxViews = Math.max(...funnel.steps.map((s) => s.views));
                const widthPercent = maxViews > 0 ? (step.views / maxViews) * 100 : 0;
                const isHighDropoff = step.dropoffRate > 30;
                
                return (
                  <div key={step.stepNumber} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                          {step.stepNumber}
                        </span>
                        <span className="font-medium">{step.stepName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span>{step.views} views</span>
                        <span>{step.completions} completed</span>
                        <span className={`flex items-center gap-1 ${isHighDropoff ? "text-red-500 font-medium" : ""}`}>
                          {isHighDropoff && <XCircle className="h-3 w-3" />}
                          {step.dropoffRate}% drop
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isHighDropoff ? "bg-red-500" : "bg-primary"
                        }`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Search,
  TrendingDown,
  Eye,
  Users,
  Sparkles,
  Globe,
  CheckCircle2,
  AlertCircle,
  Plus,
  ExternalLink,
  Download,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
// jspdf (~300 KB) and html2canvas (~200 KB) are loaded on demand from the export handler below.

const ALLOWED_EMAILS = new Set<string>(["paras@pndigital.co.uk"]);
const PN_BRAND = {
  name: "PN Digital",
  url: "https://pndigital.co.uk",
  primary: "#0B5FFF",
  dark: "#0A1F44",
};

interface MissedQuery {
  query: string;
  monthly_volume: number;
  intent: string;
  ai_platform: string;
}
interface AIOverview {
  query: string;
  ai_answer: string;
  cited_competitors: string[];
}
interface Recommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
}
interface ReportData {
  company_name: string;
  industry: string;
  summary: string;
  lost_monthly_impressions: number;
  potential_customers_monthly: number;
  ai_visibility_score: number;
  missed_queries: MissedQuery[];
  ai_overview_simulations: AIOverview[];
  recommendations: Recommendation[];
}
interface Report {
  id: string;
  website_url: string;
  company_name: string | null;
  industry: string | null;
  lost_monthly_impressions: number;
  status: string;
  report_data: ReportData;
  created_at: string;
}

const STAGES = [
  "Finding Pages",
  "Analyzing Content",
  "Checking AI Visibility",
  "Generating Report",
];

const AISeoReport = () => {
  const [user, setUser] = useState<User | null>(null);
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState<"new" | "list">("new");
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/client-auth");
        return;
      }
      const email = (session.user.email || "").toLowerCase();
      if (!ALLOWED_EMAILS.has(email)) {
        toast.error("This feature is not available for your account.");
        navigate("/client-portal");
        return;
      }
      setUser(session.user);
      loadReports();
    });
  }, [navigate]);

  // Stage animation while analyzing
  useEffect(() => {
    if (!isAnalyzing) return;
    const t = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
    }, 8000);
    return () => clearInterval(t);
  }, [isAnalyzing]);

  const loadReports = async () => {
    const { data, error } = await supabase
      .from("ai_seo_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setReports((data || []) as unknown as Report[]);
  };

  const handleGenerate = async () => {
    if (!url.trim()) {
      toast.error("Enter a website URL");
      return;
    }
    setIsAnalyzing(true);
    setStage(0);
    setActiveReport(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-ai-seo-report",
        { body: { website_url: url.trim() } },
      );
      if (error) throw error;
      const report = (data as { report: Report }).report;
      setActiveReport(report);
      await loadReports();
      toast.success("Report ready");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate report";
      toast.error(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("en-US");

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/client-portal")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to portal
            </Button>
            <div className="hidden md:flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">AI SEO Insight Report</h1>
            </div>
          </div>
          <div className="text-sm text-muted-foreground hidden sm:block">
            {user.email}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Tab switcher */}
        <div className="flex gap-2 mb-6 bg-muted/50 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab("new")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === "new"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="h-4 w-4 inline mr-1" /> Generate New
          </button>
          <button
            onClick={() => setTab("list")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === "list"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Your Reports{" "}
            <Badge variant="secondary" className="ml-1">
              {reports.length}
            </Badge>
          </button>
        </div>

        {tab === "new" && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base font-medium text-muted-foreground">
                  Website URL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-primary/30">
                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="yourdomain.com"
                      className="border-0 focus-visible:ring-0 p-0 h-auto"
                      disabled={isAnalyzing}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleGenerate();
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleGenerate}
                    disabled={isAnalyzing}
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Analyze
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {isAnalyzing && (
              <Card>
                <CardHeader>
                  <CardTitle>Analyzing Website</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    This takes about 30-60 seconds and will save your report
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {STAGES.map((s, i) => (
                      <div key={s} className="flex items-center gap-3">
                        <div className="relative">
                          {i < stage ? (
                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                          ) : i === stage ? (
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          ) : (
                            <div className="h-6 w-6 rounded-full border-2 border-muted" />
                          )}
                        </div>
                        <span
                          className={`font-medium ${
                            i === stage
                              ? "text-primary"
                              : i < stage
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {s}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeReport && !isAnalyzing && (
              <ReportView report={activeReport} fmt={fmt} />
            )}
          </>
        )}

        {tab === "list" && (
          <div className="space-y-3">
            {reports.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No reports yet. Generate your first one.
                </CardContent>
              </Card>
            ) : (
              reports.map((r) => (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:border-primary/50 transition"
                  onClick={() => {
                    setActiveReport(r);
                    setTab("new");
                  }}
                >
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">
                          {r.company_name || r.website_url}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.website_url} •{" "}
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {r.status === "completed" ? (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Lost impressions
                          </div>
                          <div className="font-bold text-destructive">
                            {fmt(r.lost_monthly_impressions)}/mo
                          </div>
                        </>
                      ) : (
                        <Badge variant="secondary">{r.status}</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const intentColor = (intent: string) =>
  intent === "transactional"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : intent === "commercial"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-sky-500/10 text-sky-600 dark:text-sky-400";

const impactColor = (i: string) =>
  i === "high"
    ? "bg-destructive/10 text-destructive"
    : i === "medium"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-muted text-muted-foreground";

const ReportView = ({
  report,
  fmt,
}: {
  report: Report;
  fmt: (n: number) => string;
}) => {
  const d = report.report_data;
  const pdfRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPDF = async () => {
    if (!pdfRef.current) return;
    setIsExporting(true);
    try {
      // Lazy-load the heavy PDF stack only when the user clicks Download.
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const node = pdfRef.current;
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: node.scrollWidth,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Multi-page slicing
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const safeName = (d?.company_name || report.website_url)
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase();
      pdf.save(`${PN_BRAND.name.replace(/\s+/g, "-")}-AI-SEO-Report-${safeName}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF");
    } finally {
      setIsExporting(false);
    }
  };

  if (!d || !d.summary) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          Report data unavailable
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="flex justify-end">
        <Button onClick={handleDownloadPDF} disabled={isExporting} size="sm">
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing PDF
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" /> Download branded PDF
            </>
          )}
        </Button>
      </div>

      <div ref={pdfRef} className="bg-white text-slate-900 p-6 rounded-lg space-y-6">
        {/* PN Digital branded cover header */}
        <div
          className="rounded-lg p-6 text-white"
          style={{
            background: `linear-gradient(135deg, ${PN_BRAND.dark} 0%, ${PN_BRAND.primary} 100%)`,
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-md flex items-center justify-center font-bold text-lg"
                style={{ background: "#ffffff", color: PN_BRAND.dark }}
              >
                PN
              </div>
              <div>
                <div className="font-bold text-lg leading-tight">{PN_BRAND.name}</div>
                <div className="text-xs opacity-80">{PN_BRAND.url}</div>
              </div>
            </div>
            <div className="text-right text-xs opacity-80">
              <div>AI SEO Insight Report</div>
              <div>{new Date(report.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            AI SEO Opportunity Report
          </h1>
          <div className="text-sm opacity-90 mb-1">Prepared for</div>
          <div className="text-2xl font-semibold">{d.company_name}</div>
          <a
            href={report.website_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm opacity-90 underline"
          >
            {report.website_url}
          </a>
          <div className="text-xs opacity-75 mt-2">Industry: {d.industry}</div>
        </div>

        {/* Executive summary */}
        <div className="border border-slate-200 rounded-lg p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
            Executive Summary
          </div>
          <p className="text-slate-800 leading-relaxed">{d.summary}</p>
        </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-destructive/30">
          <CardContent className="py-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Eye className="h-4 w-4" /> Lost Monthly Impressions
            </div>
            <div className="text-3xl font-bold text-destructive">
              {fmt(d.lost_monthly_impressions)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              In AI search results
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Users className="h-4 w-4" /> Potential Customers
            </div>
            <div className="text-3xl font-bold">
              {fmt(d.potential_customers_monthly)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Per month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingDown className="h-4 w-4" /> AI Visibility Score
            </div>
            <div className="text-3xl font-bold">{d.ai_visibility_score}/100</div>
            <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-destructive to-amber-500"
                style={{ width: `${d.ai_visibility_score}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Overviews simulation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            How your product looks in Google AI right now
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            These are real AI-generated answers Google would show for queries in
            your space. Notice who's cited - and who isn't.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {d.ai_overview_simulations.map((sim, i) => (
            <div
              key={i}
              className="border border-border rounded-lg overflow-hidden"
            >
              {/* Google search bar mock */}
              <div className="bg-muted/40 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2 text-sm">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{sim.query}</span>
                </div>
              </div>
              {/* AI overview mock */}
              <div className="p-4 bg-gradient-to-br from-sky-500/5 via-purple-500/5 to-transparent">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-500 to-purple-500 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-sm font-semibold">AI Overview</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90 mb-3">
                  {sim.ai_answer}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Cited sources:
                  </span>
                  {sim.cited_competitors.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                  <Badge
                    variant="outline"
                    className="text-xs border-destructive/40 text-destructive"
                  >
                    Not you
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Missed queries */}
      <Card>
        <CardHeader>
          <CardTitle>Queries you're missing</CardTitle>
          <p className="text-sm text-muted-foreground">
            High-intent searches where your brand should appear in AI results
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {d.missed_queries.map((q, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{q.query}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    <span className={`px-2 py-0.5 rounded ${intentColor(q.intent)}`}>
                      {q.intent}
                    </span>
                    <span className="text-muted-foreground">
                      {q.ai_platform}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(q.monthly_volume)}</div>
                  <div className="text-xs text-muted-foreground">searches/mo</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>What to do about it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.recommendations.map((r, i) => (
            <div
              key={i}
              className="border border-border rounded-lg p-4 flex items-start gap-3"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="font-semibold">{r.title}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded ${impactColor(r.impact)}`}>
                    {r.impact} impact
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {r.effort} effort
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default AISeoReport;

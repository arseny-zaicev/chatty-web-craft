import { lazy, Suspense, type ComponentType } from "react";

// Retry dynamic imports once and reload on stale chunks (fixes "Failed to fetch dynamically imported module" after deploys/HMR)
const lazyWithRetry = <T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      try {
        return await factory();
      } catch (err2) {
        if (typeof window !== "undefined") {
          const key = "__lovable_chunk_reload__";
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            window.location.reload();
          }
        }
        throw err2;
      }
    }
  });
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";

// Lazy-load all secondary routes to keep initial bundle small
const SellerLeads = lazyWithRetry(() => import("./pages/SellerLeads"));
const BrandAssets = lazyWithRetry(() => import("./pages/BrandAssets"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const ClientAuth = lazyWithRetry(() => import("./pages/ClientAuth"));
const ClientPortal = lazyWithRetry(() => import("./pages/ClientPortal"));
const ClientStats = lazyWithRetry(() => import("./pages/ClientStats"));
const AISeoReport = lazyWithRetry(() => import("./pages/AISeoReport"));
const AdminAuth = lazyWithRetry(() => import("./pages/AdminAuth"));
const AdminPanel = lazyWithRetry(() => import("./pages/AdminPanel"));
const FleetRegistry = lazyWithRetry(() => import("./pages/admin/FleetRegistry"));
const FleetAnalytics = lazyWithRetry(() => import("./pages/admin/FleetAnalytics"));
const AdminMfaSetup = lazyWithRetry(() => import("./pages/admin/AdminMfaSetup"));
const AdminMfaVerify = lazyWithRetry(() => import("./pages/admin/AdminMfaVerify"));
const Apply = lazyWithRetry(() => import("./pages/Apply"));
const SellerLeadsApply = lazyWithRetry(() => import("./pages/SellerLeadsApply"));
const WhatsAppApply = lazyWithRetry(() => import("./pages/WhatsAppApply"));
const Book = lazyWithRetry(() => import("./pages/Book"));
const Booked = lazyWithRetry(() => import("./pages/Booked"));
const Demo = lazyWithRetry(() => import("./pages/Demo"));
const BMAccess = lazyWithRetry(() => import("./pages/BMAccess"));
const CRM = lazyWithRetry(() => import("./pages/CRM"));
const Pipeline = lazyWithRetry(() => import("./pages/Pipeline"));

const WorkspaceLayout = lazyWithRetry(() => import("./pages/workspace/WorkspaceLayout"));
const WorkspaceSection = lazyWithRetry(() => import("./pages/workspace/WorkspaceSection"));
const WorkspaceOverview = lazyWithRetry(() => import("./pages/workspace/WorkspaceOverview"));

const WorkspaceSettings = lazyWithRetry(() => import("./pages/workspace/WorkspaceSettings"));
const LaunchWizard = lazyWithRetry(() => import("./pages/workspace/LaunchWizard"));
const NewClient = lazyWithRetry(() => import("./pages/workspace/NewClient"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const CustomCursor = lazyWithRetry(() => import("@/components/CustomCursor"));
const CookieConsent = lazyWithRetry(() => import("@/components/CookieConsent"));
const ScrollProgress = lazyWithRetry(() => import("@/components/ScrollProgress"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const RouteFallback = () => (
  <main className="min-h-screen bg-background flex items-center justify-center px-6">
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
      Loading secure admin area...
    </div>
  </main>
);

const SiteChrome = () => {
  const { pathname } = useLocation();
  const isAppArea = pathname.startsWith("/admin") || pathname.startsWith("/ws") || pathname === "/admin-auth" || pathname === "/client-auth";

  if (isAppArea) return null;

  return (
    <Suspense fallback={null}>
      <CustomCursor />
      <ScrollProgress />
      <CookieConsent />
    </Suspense>
  );
};

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
            <SiteChrome />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/seller-leads" element={<SellerLeads />} />
              <Route path="/brand" element={<BrandAssets />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/client-auth" element={<ClientAuth />} />
              <Route path="/client-portal" element={<ClientPortal />} />
              <Route path="/client-stats" element={<ClientStats />} />
              <Route path="/client-portal/ai-seo" element={<AISeoReport />} />
              <Route path="/admin-auth" element={<AdminAuth />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/fleet" element={<FleetRegistry />} />
              <Route path="/admin/analytics" element={<FleetAnalytics />} />
              <Route path="/admin/mfa-setup" element={<AdminMfaSetup />} />
              <Route path="/admin/mfa-verify" element={<AdminMfaVerify />} />
              <Route path="/apply" element={<Apply />} />
              <Route path="/seller-leads/apply" element={<SellerLeadsApply />} />
              <Route path="/whatsapp/apply" element={<WhatsAppApply />} />
              <Route path="/book" element={<Book />} />
              <Route path="/booked" element={<Booked />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/bm-access" element={<BMAccess />} />
              <Route path="/crm" element={<Navigate to="/admin" replace />} />
              <Route path="/pipeline" element={<Navigate to="/admin" replace />} />
              <Route path="/campaigns" element={<Navigate to="/admin" replace />} />
              <Route path="/ws" element={<WorkspaceLayout />}>
                <Route index element={<Navigate to="/admin" replace />} />
                <Route path="new" element={<NewClient />} />
                <Route path=":slug" element={<WorkspaceOverview />} />
                <Route path=":slug/overview" element={<WorkspaceOverview />} />
                <Route path=":slug/inbox" element={<WorkspaceSection section="inbox" />} />
                <Route path=":slug/pipeline" element={<WorkspaceSection section="pipeline" />} />
                <Route path=":slug/campaigns" element={<WorkspaceSection section="campaigns" />} />
                <Route path=":slug/library" element={<WorkspaceSection section="library" />} />
                <Route path=":slug/reporting" element={<Navigate to=".." replace relative="path" />} />
                <Route path=":slug/settings" element={<WorkspaceSettings />} />
                <Route path=":slug/launch" element={<LaunchWizard />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;

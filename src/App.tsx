import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from "react";

const isDynamicImportError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Failed to fetch dynamically imported module") || message.includes("Importing a module script failed");
};

const recoverFromStaleChunk = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("__lovable_chunk_reload__");
  window.location.reload();
};

// Retry dynamic imports once and reload on stale chunks (fixes "Failed to fetch dynamically imported module" after deploys/HMR)
const lazyWithRetry = <T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    const key = "__lovable_chunk_reload__";
    try {
      const mod = await factory();
      if (typeof window !== "undefined") sessionStorage.removeItem(key);
      return mod;
    } catch (err) {
      try {
        const mod = await factory();
        if (typeof window !== "undefined") sessionStorage.removeItem(key);
        return mod;
      } catch (err2) {
        if (typeof window !== "undefined" && isDynamicImportError(err2) && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
        }
        throw err2;
      }
    }
  });

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error(error, errorInfo);
    if (isDynamicImportError(error)) recoverFromStaleChunk();
  }

  render() {
    if (this.state.error && isDynamicImportError(this.state.error)) {
      return <IskraLoader message="Refreshing workspace…" />;
    }

    if (this.state.error) throw this.state.error;

    return this.props.children;
  }
}
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { IskraLoader } from "@/components/IskraLoader";
import Index from "./pages/Index";

// Lazy-load all secondary routes to keep initial bundle small
const SellerLeads = lazyWithRetry(() => import("./pages/SellerLeads"));
const BrandAssets = lazyWithRetry(() => import("./pages/BrandAssets"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const PortalAuth = lazyWithRetry(() => import("./pages/PortalAuth"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const JoinTeam = lazyWithRetry(() => import("./pages/JoinTeam"));

const AISeoReport = lazyWithRetry(() => import("./pages/AISeoReport"));
const AdminAuth = lazyWithRetry(() => import("./pages/AdminAuth"));
const AdminPanel = lazyWithRetry(() => import("./pages/AdminPanel"));
const FleetRegistry = lazyWithRetry(() => import("./pages/admin/FleetRegistry"));
const FleetAnalytics = lazyWithRetry(() => import("./pages/admin/FleetAnalytics"));
const AdminMfaSetup = lazyWithRetry(() => import("./pages/admin/AdminMfaSetup"));
const AdminMfaVerify = lazyWithRetry(() => import("./pages/admin/AdminMfaVerify"));
const OpsLive = lazyWithRetry(() => import("./pages/admin/OpsLive"));
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
const Roadmap = lazyWithRetry(() => import("./pages/workspace/Roadmap"));
const WorkspacePrepProfiles = lazyWithRetry(() => import("./pages/workspace/WorkspacePrepProfiles"));
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

const RouteFallback = () => <IskraLoader />;

const SiteChrome = () => {
  const { pathname } = useLocation();
  const isAppArea = pathname.startsWith("/admin") || pathname.startsWith("/ws") || pathname.startsWith("/join/") || pathname === "/admin-auth" || pathname === "/portal-auth" || pathname === "/accept-invite";

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
          <ChunkErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/seller-leads" element={<SellerLeads />} />
              <Route path="/brand" element={<BrandAssets />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/client-auth" element={<Navigate to="/portal-auth" replace />} />
              <Route path="/client-portal" element={<Navigate to="/portal-auth" replace />} />
              <Route path="/client-stats" element={<Navigate to="/portal-auth" replace />} />
              <Route path="/client-portal/ai-seo" element={<AISeoReport />} />
              <Route path="/portal-auth" element={<PortalAuth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/admin-auth" element={<AdminAuth />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/fleet" element={<FleetRegistry />} />
              <Route path="/admin/analytics" element={<FleetAnalytics />} />
              <Route path="/admin/mfa-setup" element={<AdminMfaSetup />} />
              <Route path="/admin/mfa-verify" element={<AdminMfaVerify />} />
              <Route path="/admin/ops-live" element={<OpsLive />} />
              <Route path="/tv/:token" element={<OpsLive />} />
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
                <Route path=":slug/data" element={<WorkspaceSection section="data" />} />
                <Route path=":slug/data/profiles" element={<WorkspacePrepProfiles />} />
                <Route path=":slug/reporting" element={<Navigate to=".." replace relative="path" />} />
                <Route path=":slug/settings" element={<WorkspaceSettings />} />
                <Route path=":slug/launch" element={<LaunchWizard />} />
                <Route path=":slug/roadmap" element={<Roadmap />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ChunkErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;

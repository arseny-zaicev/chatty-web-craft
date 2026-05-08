import { lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import CustomCursor from "@/components/CustomCursor";
import CookieConsent from "@/components/CookieConsent";
import ScrollProgress from "@/components/ScrollProgress";
import Index from "./pages/Index";

// Lazy-load all secondary routes to keep initial bundle small
const SellerLeads = lazy(() => import("./pages/SellerLeads"));
const BrandAssets = lazy(() => import("./pages/BrandAssets"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const ClientAuth = lazy(() => import("./pages/ClientAuth"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const ClientStats = lazy(() => import("./pages/ClientStats"));
const AISeoReport = lazy(() => import("./pages/AISeoReport"));
const AdminAuth = lazy(() => import("./pages/AdminAuth"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Apply = lazy(() => import("./pages/Apply"));
const SellerLeadsApply = lazy(() => import("./pages/SellerLeadsApply"));
const WhatsAppApply = lazy(() => import("./pages/WhatsAppApply"));
const Book = lazy(() => import("./pages/Book"));
const Booked = lazy(() => import("./pages/Booked"));
const Demo = lazy(() => import("./pages/Demo"));
const BMAccess = lazy(() => import("./pages/BMAccess"));
const CRM = lazy(() => import("./pages/CRM"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const WorkspaceLayout = lazy(() => import("./pages/workspace/WorkspaceLayout"));
const WorkspaceSection = lazy(() => import("./pages/workspace/WorkspaceSection"));
const WorkspaceOverview = lazy(() => import("./pages/workspace/WorkspaceOverview"));
const WorkspaceReporting = lazy(() => import("./pages/workspace/WorkspaceReporting"));
const WorkspaceSettings = lazy(() => import("./pages/workspace/WorkspaceSettings"));
const LaunchWizard = lazy(() => import("./pages/workspace/LaunchWizard"));
const NewClient = lazy(() => import("./pages/workspace/NewClient"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
  <div className="min-h-screen bg-background" aria-hidden="true" />
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CustomCursor />
        <ScrollProgress />
        <BrowserRouter>
          <ScrollToTop />
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
          <CookieConsent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;

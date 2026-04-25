import { lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
const AdminAuth = lazy(() => import("./pages/AdminAuth"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Apply = lazy(() => import("./pages/Apply"));
const SellerLeadsApply = lazy(() => import("./pages/SellerLeadsApply"));
const WhatsAppApply = lazy(() => import("./pages/WhatsAppApply"));
const Book = lazy(() => import("./pages/Book"));
const Booked = lazy(() => import("./pages/Booked"));
const Demo = lazy(() => import("./pages/Demo"));
const BMAccess = lazy(() => import("./pages/BMAccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

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
              <Route path="/admin-auth" element={<AdminAuth />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/apply" element={<Apply />} />
              <Route path="/seller-leads/apply" element={<SellerLeadsApply />} />
              <Route path="/whatsapp/apply" element={<WhatsAppApply />} />
              <Route path="/book" element={<Book />} />
              <Route path="/booked" element={<Booked />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/bm-access" element={<BMAccess />} />
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

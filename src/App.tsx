import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import CustomCursor from "@/components/CustomCursor";
import ScrollProgress from "@/components/ScrollProgress";
import Index from "./pages/Index";
import SellerLeads from "./pages/SellerLeads";
import BrandAssets from "./pages/BrandAssets";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import ClientAuth from "./pages/ClientAuth";
import ClientPortal from "./pages/ClientPortal";
import ClientStats from "./pages/ClientStats";
import AdminAuth from "./pages/AdminAuth";
import AdminPanel from "./pages/AdminPanel";
import Apply from "./pages/Apply";
import SellerLeadsApply from "./pages/SellerLeadsApply";
import WhatsAppApply from "./pages/WhatsAppApply";
import Booked from "./pages/Booked";
import Demo from "./pages/Demo";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
            <Route path="/booked" element={<Booked />} />
            <Route path="/demo" element={<Demo />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;

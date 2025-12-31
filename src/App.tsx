import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import SellerLeads from "./pages/SellerLeads";
import AIAgent from "./pages/AIAgent";
import BrandAssets from "./pages/BrandAssets";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import ClientAuth from "./pages/ClientAuth";
import ClientPortal from "./pages/ClientPortal";
import AdminAuth from "./pages/AdminAuth";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/seller-leads" element={<SellerLeads />} />
            <Route path="/ai-agent" element={<AIAgent />} />
            <Route path="/brand" element={<BrandAssets />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/client-auth" element={<ClientAuth />} />
            <Route path="/client-portal" element={<ClientPortal />} />
            <Route path="/admin-auth" element={<AdminAuth />} />
            <Route path="/admin" element={<AdminPanel />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;

import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { SellerLeadsForm } from "@/components/SellerLeadsForm";
import { Sparkles } from "lucide-react";

const SellerLeadsApply = () => {
  return (
    <>
      <Helmet>
        <title>Get Seller Leads | ISKRA</title>
        <meta 
          name="description" 
          content="Apply for exclusive seller leads in Dubai. Fill out our qualification form to start receiving motivated seller contacts." 
        />
        <link rel="canonical" href="https://iskra.ae/seller-leads/apply" />
      </Helmet>
      
      <main className="min-h-screen bg-foreground">
        {/* Header */}
        <header className="py-6 border-b border-background/10">
          <div className="container mx-auto px-4">
            <Link to="/seller-leads" className="flex items-center gap-2 w-fit">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-iskra-emerald to-iskra-emerald/70 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-background">
                ISKRA
              </span>
            </Link>
          </div>
        </header>

        <SellerLeadsForm />

        {/* Footer */}
        <footer className="py-6 border-t border-background/10">
          <div className="container mx-auto px-4 text-center">
            <p className="text-background/50 text-sm">
              © {new Date().getFullYear()} ISKRA. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
};

export default SellerLeadsApply;

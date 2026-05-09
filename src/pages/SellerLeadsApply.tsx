import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { SellerLeadsForm } from "@/components/SellerLeadsForm";
import { IskraLogo } from "@/components/IskraLogo";

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
            <Link to="/seller-leads" className="w-fit">
              <IskraLogo size={32} textClass="text-xl text-background font-bold" />
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

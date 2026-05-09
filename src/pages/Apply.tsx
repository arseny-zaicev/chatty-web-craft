import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { QualificationForm } from "@/components/QualificationForm";
import { IskraLogo } from "@/components/IskraLogo";

const Apply = () => {
  return (
    <>
      <Helmet>
        <title>Apply | ISKRA</title>
        <meta 
          name="description" 
          content="Apply to work with ISKRA. Fill out our qualification form to see if we're the right fit for your business." 
        />
        <link rel="canonical" href="https://iskra.ae/apply" />
      </Helmet>
      
      <main className="min-h-screen bg-foreground">
        {/* Header */}
        <header className="py-6 border-b border-background/10">
          <div className="container mx-auto px-4">
            <Link to="/" className="w-fit">
              <IskraLogo size={32} textClass="text-xl text-background font-bold" />
            </Link>
          </div>
        </header>

        <QualificationForm />

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

export default Apply;

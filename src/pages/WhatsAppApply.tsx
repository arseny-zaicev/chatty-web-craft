import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { WhatsAppOutreachForm } from "@/components/WhatsAppOutreachForm";
import logo from "@/assets/logo/iskra-logo-horizontal.png";

const WhatsAppApply = () => {
  return (
    <>
      <Helmet>
        <title>WhatsApp Outreach Application | ISKRA</title>
        <meta 
          name="description" 
          content="Get a customized WhatsApp outreach plan. High-volume messaging with 98% delivery rate." 
        />
      </Helmet>

      <div className="min-h-screen bg-foreground">
        {/* Simple Header */}
        <header className="py-6 px-4 border-b border-background/10">
          <div className="container mx-auto flex justify-center">
            <Link to="/">
              <img 
                src={logo} 
                alt="ISKRA" 
                className="h-8 md:h-10 w-auto"
              />
            </Link>
          </div>
        </header>

        {/* Form */}
        <WhatsAppOutreachForm />

        {/* Simple Footer */}
        <footer className="py-8 px-4 border-t border-background/10">
          <div className="container mx-auto text-center">
            <p className="text-background/50 text-sm">
              © {new Date().getFullYear()} ISKRA. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default WhatsAppApply;

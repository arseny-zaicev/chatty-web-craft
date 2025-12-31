import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const Terms = () => {
  return (
    <>
      <Helmet>
        <title>Terms of Service | ISKRA</title>
        <meta name="description" content="Terms of Service for ISKRA - Understand the terms and conditions that govern your use of our services." />
      </Helmet>
      
      <main className="min-h-screen">
        <Navbar />
        
        <section className="pt-32 pb-24">
          <div className="container mx-auto px-4 max-w-4xl">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-8">
              Terms of <span className="text-gradient">Service</span>
            </h1>
            
            <div className="prose prose-invert max-w-none space-y-8">
              <p className="text-lg text-foreground/80">
                Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">1. Acceptance of Terms</h2>
                <p className="text-foreground/70">
                  By accessing or using ISKRA's services, you agree to be bound by these Terms of Service. 
                  If you do not agree to these terms, please do not use our services.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">2. Services</h2>
                <p className="text-foreground/70">
                  ISKRA provides AI-powered sales automation, WhatsApp outreach solutions, and lead generation 
                  services. The specific terms of each service engagement will be outlined in individual 
                  service agreements.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">3. Payment Terms</h2>
                <p className="text-foreground/70">
                  Payment terms, including pricing, billing cycles, and refund policies, will be specified 
                  in your service agreement. All fees are non-refundable unless otherwise stated.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">4. Confidentiality</h2>
                <p className="text-foreground/70">
                  Both parties agree to maintain the confidentiality of any proprietary information shared 
                  during the course of our business relationship. This includes, but is not limited to, 
                  client data, business strategies, and technical information.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">5. Limitation of Liability</h2>
                <p className="text-foreground/70">
                  ISKRA shall not be liable for any indirect, incidental, special, consequential, or punitive 
                  damages arising out of or related to your use of our services.
                </p>
              </div>

              <div className="glass-card rounded-2xl p-8 space-y-6">
                <h2 className="font-display text-2xl font-semibold text-foreground">6. Contact</h2>
                <p className="text-foreground/70">
                  For questions regarding these Terms of Service, please contact us at:
                </p>
                <p className="text-iskra-emerald font-medium">
                  arseny@iskra.ae
                </p>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
};

export default Terms;
import { Helmet } from "react-helmet-async";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { ClientLogos } from "@/components/ClientLogos";
import { WhatsAppStages } from "@/components/whatsapp/WhatsAppStages";
import { CampaignTypes } from "@/components/CampaignTypes";
import { ROICalculator } from "@/components/whatsapp/ROICalculator";
import { ClientDashboardPreview } from "@/components/whatsapp/ClientDashboardPreview";
import { ProductTiers } from "@/components/whatsapp/ProductTiers";
import { Testimonials } from "@/components/Testimonials";
import { FounderSection } from "@/components/FounderSection";
import { FAQ } from "@/components/FAQ";

import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>ISKRA | WhatsApp Booking Engine Dubai</title>
        <meta 
          name="description" 
          content="WhatsApp outreach engine that delivers predictable interested replies and booked calls. Dedicated infrastructure, proven copy, full funnel tracking. Dubai." 
        />
        <meta name="keywords" content="WhatsApp outreach Dubai, WhatsApp booking engine, lead generation UAE, B2B outreach, appointment setting, WhatsApp automation" />
        <link rel="canonical" href="https://iskra.ae/" />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            "name": "ISKRA",
            "description": "WhatsApp Booking Engine — predictable pipeline from WhatsApp outreach",
            "url": "https://iskra.ae",
            "telephone": "+971-56-878-5008",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Dubai",
              "addressCountry": "AE"
            },
            "areaServed": {
              "@type": "City",
              "name": "Dubai"
            },
            "serviceType": ["WhatsApp Marketing", "Lead Generation", "Appointment Setting"],
            "priceRange": "$$"
          })}
        </script>
      </Helmet>
      
      <div className="shimmer-layer-2" />
      <main className="min-h-screen relative z-[1]">
        <WhatsAppFloat />
        <Navbar />
        <HeroSection />
        <ClientLogos />
        <CampaignTypes />
        <WhatsAppStages />
        <ROICalculator />
        <ClientDashboardPreview />
        <ProductTiers />
        <Testimonials />
        <FounderSection />
        <FAQ />
        {/* CTA to Demo */}
        <section className="py-24 bg-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-background mb-4">
              Ready to Launch Your Campaign?
            </h2>
            <p className="text-background/60 max-w-xl mx-auto mb-8">
              Tell us about your goals and we'll build a custom outreach plan for you.
            </p>
            <a href="/demo">
              <button className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-full bg-iskra-emerald text-background font-semibold text-lg shadow-[0_0_20px_rgba(0,224,150,0.3)] hover:shadow-[0_0_30px_rgba(0,224,150,0.5)] transition-all duration-300">
                Book a Demo
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </a>
          </div>
        </section>
        <Footer />
      </main>
    </>
  );
};

export default Index;

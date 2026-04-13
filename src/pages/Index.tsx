import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { ClientLogos } from "@/components/ClientLogos";
import { CampaignTypes } from "@/components/CampaignTypes";
import { HowItWorks } from "@/components/HowItWorks";
import { ClientDashboardPreview } from "@/components/whatsapp/ClientDashboardPreview";
import { Testimonials } from "@/components/Testimonials";
import { ROICalculator } from "@/components/whatsapp/ROICalculator";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { FounderSection } from "@/components/FounderSection";
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
        <meta name="keywords" content="WhatsApp outreach Dubai, WhatsApp booking engine, lead generation UAE, B2B outreach, appointment setting, WhatsApp automation, WhatsApp marketing agency Dubai" />
        <link rel="canonical" href="https://iskra.ae/" />
        <meta name="language" content="en" />
        
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            "name": "ISKRA",
            "description": "WhatsApp Booking Engine - predictable pipeline from WhatsApp outreach",
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
        <HowItWorks />
        <ClientDashboardPreview />
        <Testimonials />
        <ROICalculator />
        <Pricing />
        <FAQ />
        <FounderSection />
        <Footer />
      </main>
    </>
  );
};

export default Index;

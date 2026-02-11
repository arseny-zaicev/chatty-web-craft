import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { ClientLogos } from "@/components/ClientLogos";
import { WhatsAppStages } from "@/components/whatsapp/WhatsAppStages";
import { ROICalculator } from "@/components/whatsapp/ROICalculator";
import { ClientDashboardPreview } from "@/components/whatsapp/ClientDashboardPreview";
import { ProductTiers } from "@/components/whatsapp/ProductTiers";
import { Testimonials } from "@/components/Testimonials";
import { FAQ } from "@/components/FAQ";
import { FitCheckForm } from "@/components/whatsapp/FitCheckForm";
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
      
      <main className="min-h-screen">
        <Navbar />
        <HeroSection />
        <ClientLogos />
        <WhatsAppStages />
        <ROICalculator />
        <ClientDashboardPreview />
        <ProductTiers />
        <Testimonials />
        <FAQ />
        <FitCheckForm />
        <Footer />
      </main>
    </>
  );
};

export default Index;

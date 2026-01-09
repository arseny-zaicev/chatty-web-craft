import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { ClientLogos } from "@/components/ClientLogos";
import { LiveCounter } from "@/components/LiveCounter";
import { HowItWorks } from "@/components/HowItWorks";
import { Testimonials } from "@/components/Testimonials";
import { Services } from "@/components/Services";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { UrgencyBanner } from "@/components/UrgencyBanner";
import { FounderSection } from "@/components/FounderSection";
import { QualificationForm } from "@/components/QualificationForm";
import { Footer } from "@/components/Footer";
import { ServiceRouterPopup } from "@/components/ServiceRouterPopup";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>ISKRA | AI Chatbots & WhatsApp Outreach Dubai</title>
        <meta 
          name="description" 
          content="Dubai's #1 WhatsApp outreach & AI chatbot agency. Send thousands of messages, automate lead qualification, book meetings 24/7. 98% delivery rate guaranteed." 
        />
        <meta name="keywords" content="AI chatbot Dubai, WhatsApp outreach UAE, lead generation Dubai, real estate leads, AI agent, WhatsApp automation, seller leads Dubai" />
        <link rel="canonical" href="https://iskra.ae/" />
        
        {/* Service Schema */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            "name": "ISKRA",
            "description": "AI Chatbots & WhatsApp Outreach Solutions in Dubai",
            "url": "https://iskra.ae",
            "telephone": "+971-56-878-5008",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Dubai",
              "addressCountry": "AE"
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": "25.2048",
              "longitude": "55.2708"
            },
            "areaServed": {
              "@type": "City",
              "name": "Dubai"
            },
            "serviceType": ["AI Chatbot Development", "WhatsApp Marketing", "Lead Generation"],
            "priceRange": "$$"
          })}
        </script>
      </Helmet>
      
      <main className="min-h-screen">
        <ServiceRouterPopup />
        <Navbar />
        <HeroSection />
        <ClientLogos />
        <LiveCounter />
        <HowItWorks />
        <Testimonials />
        <Services />
        <Pricing />
        <FAQ />
        <UrgencyBanner type="ai-agent" />
        <FounderSection />
        <QualificationForm />
        <Footer />
      </main>
    </>
  );
};

export default Index;

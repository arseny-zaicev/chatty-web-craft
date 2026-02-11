import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WhatsAppHero } from "@/components/whatsapp/WhatsAppHero";
import { WhatsAppStages } from "@/components/whatsapp/WhatsAppStages";
import { ROICalculator } from "@/components/whatsapp/ROICalculator";
import { ProductTiers } from "@/components/whatsapp/ProductTiers";
import { ClientDashboardPreview } from "@/components/whatsapp/ClientDashboardPreview";
import { SuccessStories } from "@/components/whatsapp/SuccessStories";
import { FitCheckForm } from "@/components/whatsapp/FitCheckForm";

const WhatsApp = () => {
  return (
    <>
      <Helmet>
        <title>WhatsApp Booking Engine | Outreach & Lead Generation | ISKRA</title>
        <meta
          name="description"
          content="WhatsApp outreach engine that delivers predictable interested replies and booked calls. Dedicated infrastructure, copy sequences, full funnel tracking. ISKRA Dubai."
        />
        <meta name="keywords" content="WhatsApp outreach, WhatsApp booking engine, lead generation, WhatsApp marketing Dubai, B2B outreach, appointment setting" />
        <link rel="canonical" href="https://iskra.ae/whatsapp" />

        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "WhatsApp Booking Engine",
            "provider": {
              "@type": "Organization",
              "name": "ISKRA",
              "url": "https://iskra.ae",
            },
            "description": "WhatsApp outreach system for predictable pipeline generation",
            "areaServed": "Worldwide",
            "serviceType": "WhatsApp Marketing & Outreach",
          })}
        </script>
      </Helmet>

      <main className="min-h-screen">
        <Navbar />
        <WhatsAppHero />
        <WhatsAppStages />
        <ROICalculator />
        <ClientDashboardPreview />
        <ProductTiers />
        <SuccessStories />
        <FitCheckForm />
        <Footer />
      </main>
    </>
  );
};

export default WhatsApp;

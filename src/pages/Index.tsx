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
        <title>ISKRA Digital | AI Chatbots & WhatsApp Outreach Solutions</title>
        <meta 
          name="description" 
          content="The first choice for WhatsApp outreach. Send thousands of messages, manage AI chatbots, and build converting websites. 98% delivery rate guaranteed." 
        />
        <meta name="keywords" content="AI chatbot, WhatsApp outreach, lead generation, web development, ISKRA" />
        <link rel="canonical" href="https://iskradigital.com" />
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
        <UrgencyBanner />
        <FounderSection />
        <QualificationForm />
        <Footer />
      </main>
    </>
  );
};

export default Index;

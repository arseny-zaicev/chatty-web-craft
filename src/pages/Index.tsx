import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { HowItWorks } from "@/components/HowItWorks";
import { DashboardPreview } from "@/components/DashboardPreview";
import { Services } from "@/components/Services";
import { QualificationForm } from "@/components/QualificationForm";
import { Footer } from "@/components/Footer";

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
        <Navbar />
        <HeroSection />
        <HowItWorks />
        <DashboardPreview />
        <Services />
        <QualificationForm />
        <Footer />
      </main>
    </>
  );
};

export default Index;

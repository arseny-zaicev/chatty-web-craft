import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { SellerLeadsForm } from "@/components/SellerLeadsForm";
import { SellerLeadsHowItWorks } from "@/components/SellerLeadsHowItWorks";
import { SellerLeadsStats } from "@/components/SellerLeadsStats";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { UrgencyBanner } from "@/components/UrgencyBanner";
import { DashboardDemo } from "@/components/DashboardDemo";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { ArrowRight, MapPin, Users, TrendingUp, CheckCircle2, Building2, Database, Shield, Star, Zap, Check } from "lucide-react";

import salesforgeLogo from "@/assets/clients/salesforge-logo.png";
import pathosLogo from "@/assets/clients/pathos-new.png";
import fbMarketingLogo from "@/assets/clients/fb-marketing-logo.png";
import enaraLogo from "@/assets/clients/enara-logo.png";
import propAiLogo from "@/assets/clients/prop-ai-logo.png";
import moreConvosLogo from "@/assets/clients/more-convos-logo.png";

const clientLogos = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://www.salesforge.ai/" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com/" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://www.instagram.com/f.b.marketing/" },
  { name: "Enara Properties", logo: enaraLogo, url: "https://enaraproperties.ae/" },
  { name: "Prop AI", logo: propAiLogo, url: "https://prop-ai.com/" },
  { name: "More Convos", logo: moreConvosLogo, url: "https://moreconvos.com/" },
];

const features = [
  {
    icon: MapPin,
    title: "Choose Any Area",
    description: "Select from any Dubai district — Palm Jumeirah, Downtown, Marina, JBR, and more",
  },
  {
    icon: Building2,
    title: "Building-Level Access",
    description: "Find owners in specific buildings, even if there's no listing on the market",
  },
  {
    icon: Users,
    title: "Direct Owner Contacts",
    description: "Get WhatsApp-verified phone numbers of property owners ready to sell or rent",
  },
  {
    icon: TrendingUp,
    title: "Fresh Data Daily",
    description: "Our database updates daily with the latest ownership and contact information",
  },
];

const benefits = [
  "Search by district, building, or unit type",
  "Off-market owners — no public listings required",
  "WhatsApp-verified owner phone numbers",
  "Updated daily with fresh data",
  "Exclusive access — not shared with competitors",
  "Full property details & ownership history",
];

const SellerLeads = () => {
  const scrollToForm = () => {
    document.getElementById("seller-leads-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Helmet>
        <title>Dubai Seller Leads | ISKRA - Property Owner Database 220K+</title>
        <meta
          name="description"
          content="Access Dubai's largest property owner database with 220K+ contacts. Find sellers before they list. WhatsApp-verified contacts, 85% accuracy. 150 AED per lead."
        />
        <meta name="keywords" content="Dubai seller leads, property leads Dubai, real estate leads UAE, off-market sellers Dubai, property owner database, motivated sellers Dubai" />
        <link rel="canonical" href="https://iskra.ae/seller-leads" />
        
        {/* Product Schema for Seller Leads */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Dubai Property Seller Leads",
            "description": "Exclusive property seller leads in Dubai with WhatsApp-verified contacts",
            "brand": {
              "@type": "Brand",
              "name": "ISKRA"
            },
            "offers": {
              "@type": "Offer",
              "price": "150",
              "priceCurrency": "AED",
              "priceValidUntil": "2026-12-31",
              "availability": "https://schema.org/InStock",
              "url": "https://iskra.ae/seller-leads"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.8",
              "reviewCount": "50"
            }
          })}
        </script>
      </Helmet>

      <main className="min-h-screen">
        <Navbar />

        {/* Hero Section - Premium Design */}
        <section className="relative pt-32 pb-24 overflow-hidden">
          {/* 3D Animated Background */}
          <AnimatedBackground />
          
          {/* Background overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-transparent z-[1]" />
          

          <div className="container mx-auto px-4 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left Content */}
              <div className="animate-fade-in">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-iskra-emerald/15 border border-iskra-emerald/30 text-iskra-emerald text-sm font-medium mb-8 shadow-lg shadow-iskra-emerald/10">
                  <Database className="w-4 h-4" />
                  Dubai's Most Comprehensive Owner Database
                </div>

                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-8">
                  <span className="text-foreground">Find Sellers</span>
                  <br />
                  <span className="text-gradient">Before They List</span>
                </h1>

                <p className="text-xl md:text-2xl text-foreground/80 mb-10 max-w-xl leading-relaxed">
                  Access Dubai's most comprehensive owner database. Choose any district and building — find property owners ready to sell or rent, even if there's no listing on the market.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 mb-12">
                  <Button 
                    variant="hero" 
                    size="lg" 
                    onClick={scrollToForm} 
                    className="group text-lg px-8 py-6 shadow-xl shadow-iskra-emerald/20"
                  >
                    Get Started
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="lg"
                    onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                    className="text-lg px-8 py-6 border-2 border-foreground/20 text-foreground hover:bg-foreground/10"
                  >
                    Learn More
                  </Button>
                </div>
              </div>

              {/* Right Content - Stats */}
              <div className="relative flex flex-col items-center lg:items-end gap-6">
                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className="glass-card rounded-2xl p-6 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.2s" }}>
                    <div className="text-4xl font-bold text-iskra-emerald mb-2">220K+</div>
                    <div className="text-sm text-foreground/70 font-medium">Owners in Database</div>
                  </div>
                  <div className="glass-card rounded-2xl p-6 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.3s" }}>
                    <div className="text-4xl font-bold text-iskra-emerald mb-2">Quarterly</div>
                    <div className="text-sm text-foreground/70 font-medium">Database Updates</div>
                  </div>
                  <div className="glass-card rounded-2xl p-6 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.4s" }}>
                    <div className="text-4xl font-bold text-iskra-emerald mb-2">50+</div>
                    <div className="text-sm text-foreground/70 font-medium">Leads Every Week</div>
                  </div>
                  <div className="glass-card rounded-2xl p-6 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.5s" }}>
                    <div className="text-4xl font-bold text-iskra-emerald mb-2">85%</div>
                    <div className="text-sm text-foreground/70 font-medium">Contact Accuracy</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Client Logos - Marquee */}
        <section className="py-12 border-t border-border/30 overflow-hidden">
          <div className="container mx-auto px-4">
            <p className="text-center text-foreground/60 text-sm mb-8 font-medium uppercase tracking-widest">Companies we work with</p>
          </div>
          <div className="relative py-8 bg-background/50 backdrop-blur-sm rounded-2xl mx-4">
            <div className="flex animate-marquee-slow items-center">
              {[...clientLogos, ...clientLogos, ...clientLogos, ...clientLogos].map((client, idx) => (
                <a
                  key={`${client.name}-${idx}`}
                  href={client.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 mx-16 opacity-90 hover:opacity-100 transition-all duration-500 hover:scale-110"
                >
                  <img
                    src={client.logo}
                    alt={`${client.name} logo`}
                    className="h-10 md:h-14 w-auto object-contain brightness-0 invert opacity-80 hover:opacity-100 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <SellerLeadsStats />

        {/* How It Works Section */}
        <SellerLeadsHowItWorks />

        {/* Video Demo Section */}
        <section className="py-24 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                See How It <span className="text-gradient">Works</span>
              </h2>
              <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
                Watch how we generate exclusive seller leads for Dubai real estate agents
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto">
              <VideoThumbnail videoSrc="/videos/seller-leads-demo.mp4" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
                Why Our <span className="text-gradient">Leads Convert</span>
              </h2>
              <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
                We don't just find leads — we find motivated sellers who are ready to act
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="glass-card rounded-2xl p-8 hover:border-iskra-emerald/30 transition-all duration-300 group"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-14 h-14 rounded-xl bg-iskra-emerald/15 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-iskra-emerald/25 transition-all duration-300">
                    <feature.icon className="w-7 h-7 text-iskra-emerald group-hover:rotate-12 transition-transform duration-300" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-3 text-foreground">{feature.title}</h3>
                  <p className="text-foreground/70">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="font-display text-4xl md:text-5xl font-bold mb-8">
                  Everything You Need to
                  <br />
                  <span className="text-gradient">Close More Deals</span>
                </h2>
                <p className="text-xl text-foreground/70 mb-4">
                  Our leads come with comprehensive data so you can focus on what matters — closing deals.
                </p>
                <p className="text-lg text-iskra-emerald font-medium mb-10">
                  Let your agents work with leads who are already interested — no more wasting hours on cold outreach.
                </p>

                <div className="space-y-4">
                  {benefits.map((benefit) => (
                    <div key={benefit} className="flex items-center gap-4">
                      <CheckCircle2 className="w-6 h-6 text-iskra-emerald flex-shrink-0" />
                      <span className="text-lg text-foreground/90">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dashboard Demo */}
              <div className="relative">
                <DashboardDemo />
                
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-iskra-emerald/10 rounded-3xl blur-2xl -z-10" />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-24 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
                Simple <span className="text-gradient">Pay-Per-Lead</span> Pricing
              </h2>
              <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
                Only pay for leads that respond positively. No subscriptions, no hidden fees.
              </p>
            </div>

            <div className="max-w-lg mx-auto">
              <div className="relative glass-card rounded-3xl p-8 md:p-10 border-iskra-emerald/50 shadow-glow">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-iskra-emerald rounded-full text-sm font-semibold text-primary-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Pay Per Result
                </div>

                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center gap-2 mb-2">
                    <span className="text-5xl font-bold text-iskra-emerald">150 AED</span>
                    <span className="text-foreground/50">/ lead</span>
                  </div>
                  <p className="text-foreground/60">~€38 per qualified lead</p>
                </div>

                <ul className="space-y-4 mb-8">
                  {[
                    "Choose any district in Dubai",
                    "Get leads instantly after positive response",
                    "WhatsApp-verified owner contacts",
                    "Full property & ownership details",
                    "No monthly subscription",
                    "Pay only for interested sellers",
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-iskra-emerald/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-iskra-emerald" />
                      </div>
                      <span className="text-foreground/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="hero"
                  size="lg"
                  className="w-full group"
                  onClick={scrollToForm}
                >
                  Start Getting Leads
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </div>

            <p className="text-center text-foreground/50 mt-8 text-sm">
              Bulk packages available for agencies. Contact us for volume discounts.
            </p>
          </div>
        </section>

        {/* Testimonials Placeholder */}
        <section className="py-24 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
                What Agents <span className="text-gradient">Say About Us</span>
              </h2>
              <p className="text-xl text-foreground/70 max-w-2xl mx-auto">
                Join 50+ Dubai real estate agents who are closing more deals with our leads
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass-card rounded-2xl p-8 border-iskra-emerald/10">
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className="w-5 h-5 fill-iskra-gold text-iskra-gold" />
                    ))}
                  </div>
                  <div className="h-24 rounded-lg bg-foreground/5 border border-dashed border-foreground/20 flex items-center justify-center mb-6">
                    <span className="text-sm text-foreground/40">Testimonial {i}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-foreground/10 border border-dashed border-foreground/20" />
                    <div>
                      <div className="h-4 w-24 bg-foreground/10 rounded mb-2" />
                      <div className="h-3 w-32 bg-foreground/5 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Urgency Banner */}
        <UrgencyBanner type="seller-leads" />

        {/* Form Section */}
        <SellerLeadsForm />

        <Footer />
      </main>
    </>
  );
};

export default SellerLeads;

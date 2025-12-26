import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { SellerLeadsForm } from "@/components/SellerLeadsForm";
import { ArrowRight, MapPin, Users, TrendingUp, CheckCircle2, Building2, Database, Shield, Star } from "lucide-react";

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
        <title>Seller Leads for Dubai | ISKRA Digital - Exclusive Property Seller Leads</title>
        <meta
          name="description"
          content="Get exclusive, pre-qualified property seller leads in Dubai. High conversion rates, WhatsApp-verified contacts, and 30-day replacement guarantee."
        />
        <meta name="keywords" content="Dubai seller leads, property leads Dubai, real estate leads, motivated sellers Dubai" />
        <link rel="canonical" href="https://iskradigital.com/seller-leads" />
      </Helmet>

      <main className="min-h-screen">
        <Navbar />

        {/* Hero Section - Premium Design */}
        <section className="relative pt-32 pb-24 overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background/95" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/80" />
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-iskra-emerald/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-iskra-gold/5 rounded-full blur-[100px]" />

          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-iskra-emerald/15 border border-iskra-emerald/30 text-iskra-emerald text-sm font-medium mb-8 shadow-lg shadow-iskra-emerald/10">
                <Database className="w-4 h-4" />
                Dubai's Most Comprehensive Owner Database
              </div>

              <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-8">
                <span className="text-foreground">Find Sellers</span>
                <br />
                <span className="text-gradient">Before They List</span>
              </h1>

              <p className="text-xl md:text-2xl text-foreground/80 mb-10 max-w-2xl mx-auto leading-relaxed">
                Access Dubai's most comprehensive owner database. Choose any district and building — find property owners ready to sell or rent, even if there's no listing on the market.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
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

              {/* Stats - more prominent */}
              <div className="grid grid-cols-3 gap-8 max-w-xl mx-auto">
                <div className="glass-card rounded-2xl p-6 border-iskra-emerald/20">
                  <div className="text-4xl md:text-5xl font-bold text-iskra-emerald mb-2">150K+</div>
                  <div className="text-sm text-foreground/70 font-medium">Owners in Database</div>
                </div>
                <div className="glass-card rounded-2xl p-6 border-iskra-emerald/20">
                  <div className="text-4xl md:text-5xl font-bold text-iskra-emerald mb-2">85%</div>
                  <div className="text-sm text-foreground/70 font-medium">Contact Rate</div>
                </div>
                <div className="glass-card rounded-2xl p-6 border-iskra-emerald/20">
                  <div className="text-4xl md:text-5xl font-bold text-iskra-emerald mb-2">3x</div>
                  <div className="text-sm text-foreground/70 font-medium">Conversion</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Client Logos Placeholder */}
        <section className="py-12 border-t border-border/30">
          <div className="container mx-auto px-4">
            <p className="text-center text-foreground/60 text-sm mb-8 font-medium">Trusted by top Dubai agents</p>
            <div className="flex flex-wrap justify-center items-center gap-12">
              {/* Placeholder for logos */}
              {[1, 2, 3, 4].map((i) => (
                <div 
                  key={i} 
                  className="w-32 h-12 rounded-lg bg-foreground/5 border border-dashed border-foreground/20 flex items-center justify-center"
                >
                  <span className="text-xs text-foreground/40">Logo {i}</span>
                </div>
              ))}
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
                  className="glass-card rounded-2xl p-8 hover:border-iskra-emerald/30 transition-all duration-300"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-14 h-14 rounded-xl bg-iskra-emerald/15 flex items-center justify-center mb-6">
                    <feature.icon className="w-7 h-7 text-iskra-emerald" />
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
                <p className="text-xl text-foreground/70 mb-10">
                  Our leads come with comprehensive data so you can focus on what matters — closing deals.
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

              {/* Placeholder for screenshot/demo */}
              <div className="relative">
                <div className="aspect-video rounded-2xl bg-secondary/50 border border-border/50 flex items-center justify-center overflow-hidden">
                  <div className="text-center p-8">
                    <div className="w-20 h-20 rounded-full bg-iskra-emerald/20 border-2 border-dashed border-iskra-emerald/40 mx-auto mb-6 flex items-center justify-center">
                      <span className="text-3xl">📊</span>
                    </div>
                    <p className="text-lg text-foreground/60 font-medium mb-2">
                      Dashboard Screenshot
                    </p>
                    <p className="text-sm text-foreground/40">
                      Coming soon
                    </p>
                  </div>
                </div>
                
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-iskra-emerald/10 rounded-3xl blur-2xl -z-10" />
              </div>
            </div>
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

        {/* Guarantee Section */}
        <section className="py-16 bg-iskra-emerald/10 border-y border-iskra-emerald/20">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 text-center md:text-left">
              <div className="w-20 h-20 rounded-full bg-iskra-emerald/20 flex items-center justify-center">
                <Shield className="w-10 h-10 text-iskra-emerald" />
              </div>
              <div>
                <h3 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
                  30-Day Money Back Guarantee
                </h3>
                <p className="text-lg text-foreground/70">
                  Not happy with the leads? We'll refund you — no questions asked.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Form Section */}
        <SellerLeadsForm />

        <Footer />
      </main>
    </>
  );
};

export default SellerLeads;

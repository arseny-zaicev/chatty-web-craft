import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Users, TrendingUp, CheckCircle2, Building2 } from "lucide-react";

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
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
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

        {/* Hero Section */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          {/* Background effects */}
          <div className="absolute inset-0 bg-gradient-to-b from-iskra-emerald/5 via-transparent to-transparent" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-iskra-emerald/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-iskra-gold/5 rounded-full blur-3xl" />

          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-iskra-emerald/10 border border-iskra-emerald/20 text-iskra-emerald text-sm font-medium mb-6">
                <MapPin className="w-4 h-4" />
                Dubai Real Estate
              </div>

              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Find Sellers
                <br />
                <span className="text-gradient">Before They List</span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Access Dubai's most comprehensive owner database. Choose any district and building — find property owners ready to sell or rent, even if there's no listing on the market.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Button variant="hero" size="lg" onClick={scrollToContact} className="group">
                  Get Started
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button variant="outline" size="lg">
                  View Pricing
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
                <div>
                  <div className="text-3xl md:text-4xl font-bold text-iskra-emerald">500+</div>
                  <div className="text-sm text-muted-foreground">Leads/Month</div>
                </div>
                <div>
                  <div className="text-3xl md:text-4xl font-bold text-iskra-emerald">85%</div>
                  <div className="text-sm text-muted-foreground">Contact Rate</div>
                </div>
                <div>
                  <div className="text-3xl md:text-4xl font-bold text-iskra-emerald">3x</div>
                  <div className="text-sm text-muted-foreground">Conversion</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Why Our <span className="text-gradient">Leads Convert</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                We don't just find leads — we find motivated sellers who are ready to act
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="glass-card rounded-2xl p-6 hover:border-iskra-emerald/30 transition-all duration-300"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-iskra-emerald" />
                  </div>
                  <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
                  Everything You Need to
                  <br />
                  <span className="text-gradient">Close More Deals</span>
                </h2>
                <p className="text-muted-foreground mb-8">
                  Our leads come with comprehensive data so you can focus on what matters — closing deals.
                </p>

                <div className="space-y-4">
                  {benefits.map((benefit) => (
                    <div key={benefit} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-iskra-emerald flex-shrink-0" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Placeholder for screenshot/demo */}
              <div className="relative">
                <div className="aspect-video rounded-2xl bg-secondary/50 border border-border/50 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-16 h-16 rounded-full bg-iskra-emerald/20 border-2 border-dashed border-iskra-emerald/40 mx-auto mb-4 flex items-center justify-center">
                      <span className="text-2xl">📊</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Dashboard screenshot placeholder
                    </p>
                  </div>
                </div>
                
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-iskra-emerald/10 rounded-3xl blur-2xl -z-10" />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="contact" className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Ready to Get <span className="text-gradient">Quality Leads?</span>
              </h2>
              <p className="text-muted-foreground mb-8">
                Join 50+ Dubai real estate agents who are closing more deals with our exclusive seller leads.
              </p>
              <Button variant="hero" size="lg" className="group">
                Start Getting Leads
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
};

export default SellerLeads;

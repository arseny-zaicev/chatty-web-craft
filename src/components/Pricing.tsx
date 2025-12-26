import { Check, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "AI Chatbot Agent",
    price: "from $497",
    period: "/month",
    description: "Your 24/7 AI sales representative",
    features: [
      "Unlimited conversations",
      "Multi-language support",
      "CRM integration",
      "Lead qualification",
      "Meeting booking",
      "Custom training",
    ],
    highlighted: false,
  },
  {
    name: "WhatsApp Outreach",
    price: "from $997",
    period: "/month",
    description: "High-volume personalized messaging",
    features: [
      "5,000+ messages/month",
      "Aged account network",
      "Contact validation",
      "Daily analytics",
      "Copy optimization",
      "98% delivery rate",
    ],
    highlighted: true,
  },
  {
    name: "Seller Leads",
    price: "from $299",
    period: "/month",
    description: "Exclusive Dubai property owner data",
    features: [
      "Daily fresh data",
      "WhatsApp-verified contacts",
      "Building-level access",
      "Off-market owners",
      "Ownership history",
      "Exclusive leads",
    ],
    highlighted: false,
  },
];

export const Pricing = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Simple, Transparent <span className="text-gradient">Pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            No hidden fees. Cancel anytime. 30-day money-back guarantee.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative glass-card rounded-3xl p-8 transition-all duration-300 hover:scale-105 ${
                plan.highlighted
                  ? "border-iskra-emerald/50 shadow-glow"
                  : "border-border/50"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-iskra-emerald rounded-full text-sm font-semibold text-primary-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="font-display text-xl font-bold mb-2">{plan.name}</h3>
                <p className="text-foreground/60 text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-iskra-emerald">{plan.price}</span>
                  <span className="text-foreground/50">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-iskra-emerald/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-iskra-emerald" />
                    </div>
                    <span className="text-foreground/80">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? "hero" : "outline"}
                className="w-full group"
                onClick={scrollToContact}
              >
                Get Started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-foreground/50 mt-12 text-sm">
          Custom enterprise solutions available. <button onClick={scrollToContact} className="text-iskra-emerald hover:underline">Contact us</button> for a tailored quote.
        </p>
      </div>
    </section>
  );
};

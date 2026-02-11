import { Check, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const plans = [
  {
    name: "WhatsApp Outreach",
    priceEur: "from €1,500",
    priceAed: "~5,900 AED",
    period: "/ pilot",
    description: "Full WhatsApp booking engine — pilot to scale",
    features: [
      "ICP research & segmentation",
      "Copy library + A/B testing",
      "Dedicated sending accounts",
      "CRM handoff & tracking",
      "10,000+ message pilot",
      "98% delivery rate",
    ],
    highlighted: true,
    isMain: true,
  },
  {
    name: "AI Layer (Add-on)",
    priceEur: "Custom",
    priceAed: "",
    period: "pricing",
    description: "AI automation after proven results",
    features: [
      "Auto-replies to common questions",
      "Smart lead qualification",
      "CRM auto-fill & routing",
      "Human handoff on edge cases",
      "Booking automation",
      "Works on top of WhatsApp engine",
    ],
    highlighted: false,
    isMain: false,
  },
];

export const Pricing = () => {
  const navigate = useNavigate();
  
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleGetStarted = (planName: string) => {
    if (planName === "WhatsApp Outreach") {
      navigate("/whatsapp");
    } else {
      scrollToContact();
    }
  };

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Pricing Based on Your <span className="text-gradient">Needs</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              No hidden fees. Every solution comes with a guarantee.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <ScrollReveal key={plan.name} delay={index * 100}>
              <div
                className={`relative glass-card rounded-3xl p-8 hover-lift ${
                  plan.highlighted
                    ? "border-iskra-emerald/50 shadow-glow md:scale-105"
                    : "border-border/50"
                }`}
              >
              {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-iskra-emerald rounded-full text-sm font-semibold text-primary-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Core Product
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="font-display text-xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-foreground/60 text-sm mb-4">{plan.description}</p>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-iskra-emerald">{plan.priceEur}</span>
                      <span className="text-foreground/50">{plan.period}</span>
                    </div>
                    {plan.priceAed && (
                      <span className="text-sm text-foreground/40">{plan.priceAed}</span>
                    )}
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
                  className={`w-full group ${plan.highlighted ? "btn-glow" : ""}`}
                  onClick={() => handleGetStarted(plan.name)}
                >
                  Get Started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <p className="text-center text-foreground/50 mt-12 text-sm">
          Custom enterprise solutions available. <button onClick={scrollToContact} className="text-iskra-emerald hover:underline">Contact us</button> for a tailored quote.
        </p>
      </div>
    </section>
  );
};

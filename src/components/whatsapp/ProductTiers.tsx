import { Check, ArrowRight, Rocket, TrendingUp, Bot, Zap, Users, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const tiers = [
  {
    icon: Rocket,
    name: "Pilot Launch",
    duration: "2 weeks",
    price: "from €2,500",
    description: "Validate deliverability and find a winning approach before scaling.",
    features: [
      "ICP alignment + offer angle",
      "Copy + follow-up sequence (A/B plan)",
      "Dedicated WhatsApp accounts (exclusive to your company)",
      "Tracking dashboard + daily reporting access",
      "Positive reply alerts",
      "End-of-pilot report + scaling plan",
    ],
    smallNote: "Messaging usage billed separately (country-based). Final pricing depends on target country & volume.",
    cta: "Start Pilot",
    highlighted: false,
  },
  {
    icon: TrendingUp,
    name: "Growth Engine",
    duration: "Monthly",
    price: "Custom",
    description: "Ongoing optimization and scaling once the pilot proves results.",
    features: [
      "Daily monitoring (delivery, replies, account health)",
      "Weekly optimization (copy, sequences, timing, segmentation)",
      "Weekly strategy call + scaling roadmap",
      "24/7 chat access (fast response for urgent issues)",
      "Dedicated account manager",
      "Ongoing reporting + iteration",
    ],
    smallNote: "Requires a proven pilot. Messaging usage billed separately.",
    cta: "Scale Up",
    highlighted: true,
  },
  {
    icon: Bot,
    name: "Scale + AI",
    duration: "Monthly",
    price: "Custom",
    description: "Automation layer after first results are proven.",
    features: [
      "AI auto-replies + smart qualification",
      "CRM auto-fill & routing",
      "Safe mode (human handoff)",
      "Booking automation support",
      "Multi-country scaling & infrastructure",
    ],
    smallNote: "AI is introduced after the winning sequence is proven.",
    cta: "Learn More",
    highlighted: false,
  },
];

const addOns = [
  { icon: Zap, name: "Hot Lead Inbox", description: "Instant notifications when a lead shows buying intent" },
  { icon: Users, name: "Appointment Setting", description: "We call and book meetings for positive replies" },
  { icon: Headphones, name: "AI Layer", description: "Smart auto-replies and qualification on autopilot" },
];

export const ProductTiers = () => {
  const scrollToFitCheck = () => {
    document.getElementById("fit-check")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Packages
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              One Product, <span className="text-gradient">Three Levels</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Start with a pilot, grow into a predictable pipeline, add AI when ready.
            </p>
          </div>
        </ScrollReveal>

        {/* Tiers */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          {tiers.map((tier, index) => (
            <ScrollReveal key={tier.name} delay={index * 100}>
              <div className={`relative rounded-2xl p-7 h-full flex flex-col hover-lift ${
                tier.highlighted ? "card-green-outline shadow-glow" : "card-light"
              }`}>
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-iskra-emerald rounded-full text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </div>
                )}

                <div className="w-11 h-11 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4">
                  <tier.icon className="w-5 h-5 text-iskra-emerald" />
                </div>

                <h3 className="font-headline text-xl font-bold mb-1">{tier.name}</h3>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-bold text-iskra-emerald">{tier.price}</span>
                  <span className="text-xs text-muted-foreground">/ {tier.duration}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-iskra-emerald shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={tier.highlighted ? "hero" : "outline"}
                  className={`w-full group ${tier.highlighted ? "btn-glow" : ""}`}
                  onClick={scrollToFitCheck}
                >
                  {tier.cta}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>

                {tier.smallNote && (
                  <p className="text-[11px] text-muted-foreground/60 text-center mt-3 leading-snug">
                    {tier.smallNote}
                  </p>
                )}
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Add-ons */}
        <ScrollReveal delay={200}>
          <div className="max-w-3xl mx-auto">
            <h3 className="font-headline text-lg font-bold text-center mb-6 text-muted-foreground">
              Available Add-ons
            </h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {addOns.map((addon) => (
                <div key={addon.name} className="card-champagne rounded-xl p-5 text-center hover-lift">
                  <addon.icon className="w-6 h-6 text-iskra-emerald mx-auto mb-3" />
                  <h4 className="font-semibold text-sm mb-1">{addon.name}</h4>
                  <p className="text-xs text-muted-foreground">{addon.description}</p>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

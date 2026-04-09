import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const features = [
  "Dedicated WhatsApp sending accounts",
  "ICP alignment + offer strategy",
  "Custom copy & follow-up sequences",
  "Anti-block infrastructure & warmup",
  "Real-time tracking dashboard",
  "Weekly reporting & strategy calls",
  "CRM integration (Pipedrive, HubSpot, etc.)",
  "Qualified replies delivered to your team",
];

export const Pricing = () => {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="tag-green mb-4 inline-block">Pricing</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Custom to Your <span className="text-gradient">Needs</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every business is different. We build a campaign tailored to your goals, audience, and scale — not a one-size-fits-all package.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="max-w-2xl mx-auto">
            <div className="card-light rounded-3xl p-8 md:p-10">
              <h3 className="font-display text-2xl font-bold mb-2 text-center">What's included</h3>
              <p className="text-muted-foreground text-center mb-8">
                Everything you need for a high-performing WhatsApp campaign
              </p>

              <ul className="grid sm:grid-cols-2 gap-4 mb-10">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground/80">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant="cta"
                size="lg"
                className="w-full group"
                onClick={() => navigate("/demo")}
              >
                Book a Demo — Get Your Custom Quote
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>

              <p className="text-xs text-muted-foreground text-center mt-4">
                No commitment. We'll walk you through the process and pricing on a quick call.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

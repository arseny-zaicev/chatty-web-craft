import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ScrollReveal } from "@/hooks/useScrollReveal";

export const Pricing = () => {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24 bg-foreground">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-4 inline-block">
              Pricing
            </span>
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-6 text-background">
              Based on What You Need
            </h2>
            <p className="text-lg text-background/60 max-w-2xl mx-auto mb-3">
              Every campaign is custom-built around your volume, market, and goals.
            </p>
            <p className="text-background/40 mb-10">
              Book a demo to get a clear, no-obligation quote.
            </p>

            <Button
              variant="cta"
              size="lg"
              className="group text-lg px-10 py-6"
              onClick={() => navigate("/demo")}
            >
              Book a Demo
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

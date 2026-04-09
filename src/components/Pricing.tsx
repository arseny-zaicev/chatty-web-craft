import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ScrollReveal } from "@/hooks/useScrollReveal";

export const Pricing = () => {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center">
            <span className="tag-green mb-4 inline-block">Pricing</span>
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-6">
              Based on What <span className="text-gradient">You Need</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-4">
              Every campaign is built around your goals, audience size, and channel mix. 
              No fixed packages — just a plan that fits.
            </p>
            <p className="text-muted-foreground mb-10">
              Tell us what you're looking for and we'll put together a custom quote on a quick call.
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

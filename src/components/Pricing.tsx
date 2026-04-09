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
          <div className="max-w-3xl mx-auto">
            <div className="card-light rounded-2xl p-10 md:p-14 text-center relative overflow-hidden">
              {/* Subtle green accent line at top */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 rounded-b-full bg-iskra-emerald" />
              
              <span className="tag-green mb-6 inline-flex">
                Pricing
              </span>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-6">
                Based on What You Need
              </h2>
              <div className="divider-green mx-auto mb-6" />
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-3">
                Every campaign is custom-built around your volume, market, and goals.
              </p>
              <p className="text-muted-foreground/60 mb-10">
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
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

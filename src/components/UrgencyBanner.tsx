import { Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const UrgencyBanner = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-6 bg-gradient-to-r from-iskra-emerald/20 via-iskra-emerald/10 to-iskra-emerald/20 border-y border-iskra-emerald/30">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-iskra-emerald/20 flex items-center justify-center animate-pulse">
              <Clock className="w-5 h-5 text-iskra-emerald" />
            </div>
            <div>
              <p className="text-foreground font-semibold">
                Limited Availability
              </p>
              <p className="text-sm text-foreground/70">
                Only <span className="text-iskra-emerald font-bold">3 spots left</span> for January onboarding
              </p>
            </div>
          </div>
          
          <Button
            variant="hero"
            size="sm"
            onClick={scrollToContact}
            className="group"
          >
            <Zap className="w-4 h-4" />
            Claim Your Spot
          </Button>
        </div>
      </div>
    </section>
  );
};

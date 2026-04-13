import { Clock, Users, MapPin, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type UrgencyType = "ai-agent" | "whatsapp" | "seller-leads" | "general";

interface UrgencyBannerProps {
  type?: UrgencyType;
}

const urgencyContent = {
  "ai-agent": {
    icon: Users,
    title: "Limited Development Slots",
    description: "We're a small team focused on quality - only a few AI agent projects per month.",
    spots: "2 spots left for January",
    cta: "Claim Your Spot",
  },
  "whatsapp": {
    icon: Clock,
    title: "Limited Monthly Capacity",
    description: "We send a limited number of messages monthly to maintain 98% delivery.",
    spots: "Secure your slot now",
    cta: "Reserve Slot",
  },
  "seller-leads": {
    icon: MapPin,
    title: "One Agency Per District",
    description: "We work with one agency per area for exclusivity.",
    spots: "Check if your district is available",
    cta: "Check Availability",
  },
  "general": {
    icon: Zap,
    title: "Limited Availability",
    description: "Small team, quality focus.",
    spots: "3 spots left for January",
    cta: "Claim Your Spot",
  },
};

export const UrgencyBanner = ({ type = "general" }: UrgencyBannerProps) => {
  const content = urgencyContent[type];
  const Icon = content.icon;

  const scrollToContact = () => {
    if (type === "seller-leads") {
      document.getElementById("seller-leads-form")?.scrollIntoView({ behavior: "smooth" });
    } else {
      document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="py-6 bg-gradient-to-r from-iskra-gold/15 via-iskra-gold/5 to-iskra-gold/15 border-y border-iskra-gold/30">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-iskra-gold/20 flex items-center justify-center animate-pulse">
              <Icon className="w-5 h-5 text-iskra-gold" />
            </div>
            <div>
              <p className="text-foreground font-semibold">
                {content.title}
              </p>
              <p className="text-sm text-foreground/70">
                <span className="text-iskra-gold font-bold">{content.spots}</span>
                {" - "}
                {content.description}
              </p>
            </div>
          </div>
          
          <Button
            size="sm"
            onClick={scrollToContact}
            className="group bg-iskra-gold hover:bg-iskra-gold/90 text-background font-semibold"
          >
            <Zap className="w-4 h-4" />
            {content.cta}
          </Button>
        </div>
      </div>
    </section>
  );
};

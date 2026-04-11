import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight } from "lucide-react";

const HERO_BULLETS = ["Cold outreach at scale", "Warm lead follow-up", "Database reactivation"];

const HeroBullets = () => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % HERO_BULLETS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-wrap gap-3 animate-fade-in" style={{ animationDelay: "0.45s" }}>
      {HERO_BULLETS.map((text, i) => (
        <span
          key={text}
          className={`text-xs md:text-sm px-3 py-1.5 rounded-full border transition-all duration-500 ${
            i === active
              ? "border-iskra-emerald/50 bg-iskra-emerald/10 text-iskra-emerald"
              : "border-border/50 bg-transparent text-foreground/40"
          }`}
        >
          {text}
        </span>
      ))}
    </div>
  );
};

export const HeroSection = () => {
  const scrollToDemo = () => {
    window.location.href = "/demo";
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <AnimatedBackground />
      <Sparkles count={15} />

      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background/80 z-[1]" />

      <div className="max-w-[1160px] w-full mx-auto px-6 md:px-8 relative z-10 py-24 md:py-32 lg:py-40">
        {/* Eyebrow */}
        <p className="text-foreground/50 text-xs md:text-sm uppercase tracking-[0.2em] mb-12 md:mb-16 animate-fade-in font-medium">
          WhatsApp Outreach Infrastructure
        </p>

        {/* Headline */}
        <h1
          className="font-headline max-w-4xl mb-8 animate-fade-in"
          style={{
            animationDelay: "0.1s",
            fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)",
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
          }}
        >
          <span className="text-foreground">Scale WhatsApp outreach </span>
          <span className="text-iskra-emerald">without burning accounts.</span>
        </h1>

        {/* Divider */}
        <div
          className="w-16 h-[1px] bg-border/60 mb-8 animate-fade-in"
          style={{ animationDelay: "0.2s" }}
        />

        {/* Supporting paragraph */}
        <p
          className="text-lg md:text-xl lg:text-2xl text-foreground/50 max-w-2xl mb-10 leading-relaxed font-light animate-fade-in"
          style={{ animationDelay: "0.3s" }}
        >
          Send cold campaigns, follow up warm leads, and reactivate old CRM
          lists — with dedicated sending accounts, proven sequences, and full
          funnel tracking.
        </p>

        {/* Qualifier */}
        <p
          className="text-sm md:text-base text-foreground/30 max-w-lg leading-relaxed mb-10 animate-fade-in"
          style={{ animationDelay: "0.4s" }}
        >
          Built for agencies, consultancies, and service businesses selling
          high-ticket offers via personal outreach.
        </p>

        {/* Bullets */}
        <div className="mb-10">
          <HeroBullets />
        </div>

        {/* CTA */}
        <div className="animate-fade-in" style={{ animationDelay: "0.5s" }}>
          <Button
            onClick={scrollToDemo}
            variant="outline"
            className="group text-sm px-7 py-3.5 h-auto rounded-xl font-semibold tracking-wide border-border hover:border-iskra-emerald hover:text-iskra-emerald hover:bg-iskra-emerald/[0.04] transition-all duration-200"
          >
            Book a Demo
            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </section>
  );
};

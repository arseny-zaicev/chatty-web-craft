import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight, Zap } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

const HeroStat = ({ value, suffix, label }: { value: number; suffix: string; label: string }) => {
  const { formattedValue, elementRef } = useCountUp({
    end: value,
    duration: 2000,
    suffix,
  });

  return (
    <div ref={elementRef} className="glass-card rounded-2xl p-5 lg:p-6 group hover-lift hover:border-iskra-emerald/40">
      <div className="text-3xl lg:text-4xl font-bold text-iskra-emerald mb-1 font-headline">
        {formattedValue}
      </div>
      <div className="text-sm text-foreground/70 font-medium">{label}</div>
    </div>
  );
};

const LiveMessagesCounter = () => {
  const [count, setCount] = useState(10405);
  
  useEffect(() => {
    const interval = setInterval(() => {
      // Add 1-3 messages every 3-5 seconds
      setCount(prev => prev + Math.floor(Math.random() * 3) + 1);
    }, 3000 + Math.random() * 2000);
    
    return () => clearInterval(interval);
  }, []);

  const formattedCount = count.toLocaleString('en-US').replace(/,/g, ' ');

  return (
    <div className="glass-card rounded-2xl p-6 group hover-lift hover:border-iskra-emerald/40">
      <div className="flex items-center gap-2 text-foreground/60 text-sm mb-3">
        <span>Messages sent</span>
        <span className="text-iskra-emerald">· 98% delivery</span>
      </div>
      <div className="text-4xl lg:text-5xl font-bold text-foreground font-headline tracking-tight transition-all duration-500">
        {formattedCount}
      </div>
      <div className="flex items-center gap-2 mt-3 text-foreground/50 text-sm">
        <span className="w-2 h-2 bg-iskra-emerald rounded-full animate-pulse" />
        Powered by ISKRA SYSTEM
      </div>
    </div>
  );
};

export const HeroSection = () => {
  const scrollToContact = () => {
    document.getElementById("fit-check")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[90vh] flex items-center pt-24 overflow-hidden">
      <AnimatedBackground />
      <Sparkles count={15} />
      
      {/* Premium overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60 z-[1]" />
      
      <div className="container mx-auto px-6 md:px-12 lg:px-16 xl:px-24 py-12 md:py-16 relative z-10">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="flex-1 max-w-2xl">
            {/* Small subtitle */}
            <p className="text-foreground/60 text-sm md:text-base uppercase tracking-widest mb-4 animate-fade-in">
              WhatsApp Outreach Infrastructure
            </p>
            
            {/* Main headline - compact like reference */}
            <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.1] mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <span className="text-foreground">WhatsApp Booking</span>
              <br />
              <span className="text-foreground">Engine that </span>
              <span className="text-iskra-emerald whitespace-nowrap">f*cking works.</span>
            </h1>
            
            {/* Subheadline - compact */}
            <p className="text-base md:text-lg text-foreground/70 mb-8 max-w-lg leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
              Dedicated sending accounts. Proven copy sequences. Full funnel tracking. AI layer when you're ready.
            </p>

            {/* Single CTA Button - like reference */}
            <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <Button 
                onClick={scrollToContact}
                className="group text-base px-8 py-6 bg-iskra-emerald hover:bg-iskra-emerald/90 text-background rounded-xl font-semibold shadow-xl shadow-iskra-emerald/20 btn-glow"
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>

          {/* Right Content - Stats */}
          <div className="w-full lg:w-auto lg:min-w-[360px]">
            {/* Stats grid - more compact */}
            <div className="grid grid-cols-2 gap-3 mb-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <HeroStat value={4} suffix="x" label="Avg Client ROI" />
              <HeroStat value={2} suffix="min" label="Avg Response" />
              <HeroStat value={35} suffix="%" label="Reply Rate" />
              <HeroStat value={98} suffix="%" label="Delivery Rate" />
            </div>
            
            {/* Live Counter Card */}
            <div className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
              <LiveMessagesCounter />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { FloatingWorkflowNodes } from "@/components/FloatingWorkflowNodes";
import { ArrowRight, Zap } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

const HeroStat = ({ value, suffix, label }: { value: number; suffix: string; label: string }) => {
  const { formattedValue, elementRef } = useCountUp({
    end: value,
    duration: 2000,
    suffix,
  });

  return (
    <div ref={elementRef} className="glass-card rounded-2xl p-5 lg:p-6 group hover:border-iskra-emerald/40 transition-all duration-300">
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
    <div className="glass-card rounded-2xl p-6 group hover:border-iskra-emerald/40 transition-all duration-300">
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
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      <AnimatedBackground />
      <Sparkles count={15} />
      <FloatingWorkflowNodes />
      
      {/* Premium overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/70 z-[1]" />
      
      <div className="container mx-auto px-4 py-16 md:py-24 relative z-10">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          {/* Left Content - 7 columns */}
          <div className="lg:col-span-7 relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-iskra-emerald/15 border border-iskra-emerald/30 text-iskra-emerald text-sm font-semibold mb-8 animate-fade-in">
              <Zap className="w-4 h-4" />
              AI-Powered Automation
            </div>
            
            {/* Main headline - clean, bold typography like adcreative.ai */}
            <h1 className="font-headline text-5xl sm:text-6xl lg:text-7xl xl:text-[5.5rem] font-bold leading-[1.05] mb-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <span className="text-foreground">AI Agents That</span>
              <br />
              <span className="text-gradient">Save You Time</span>
              <br />
              <span className="text-gradient">& Money</span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg md:text-xl text-foreground/70 mb-10 max-w-xl leading-relaxed font-medium animate-fade-in" style={{ animationDelay: "0.2s" }}>
              Stop paying staff for repetitive tasks. Our AI handles your chats, qualifies leads, and books meetings — <span className="text-foreground">24/7, on autopilot.</span>
            </p>

            {/* CTA Buttons - cleaner style */}
            <div className="flex flex-col sm:flex-row gap-4 mb-12 animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <Button 
                onClick={scrollToContact}
                className="group text-base px-8 py-6 bg-foreground text-background hover:bg-foreground/90 rounded-xl font-semibold shadow-xl"
              >
                See If You Qualify
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="outline" 
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="text-base px-8 py-6 rounded-xl font-semibold border-2 border-foreground/20 text-foreground hover:bg-foreground/5 hover:border-foreground/30"
              >
                How It Works
              </Button>
            </div>
          </div>

          {/* Right Content - 5 columns with stats */}
          <div className="lg:col-span-5 relative">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <HeroStat value={3} suffix="x" label="More Bookings" />
              <HeroStat value={2} suffix="min" label="Avg Response" />
              <HeroStat value={90} suffix="%" label="Lead Capture" />
              <HeroStat value={0} suffix="$" label="Missed Revenue" />
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

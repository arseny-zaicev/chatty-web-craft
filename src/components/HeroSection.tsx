import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { LiveCounter } from "@/components/LiveCounter";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight, Clock, DollarSign, Zap } from "lucide-react";

export const HeroSection = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      <AnimatedBackground />
      <Sparkles count={20} />
      
      {/* Premium overlay gradient - covers only left side for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-transparent z-[1]" />
      
      <div className="container mx-auto px-4 py-16 md:py-24 relative z-10">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Content - takes 7 columns */}
          <div className="lg:col-span-7 relative z-10 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-iskra-emerald/15 border border-iskra-emerald/30 text-iskra-emerald text-sm font-medium mb-8 shadow-lg shadow-iskra-emerald/10">
              <Zap className="w-4 h-4" />
              AI-Powered Automation
            </div>
            
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-8">
              <span className="text-foreground">AI Agents That</span>
              <br />
              <span className="text-gradient">Save You Time</span>
              <br />
              <span className="text-gradient">& Money</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-foreground/80 mb-10 max-w-xl leading-relaxed">
              Stop paying staff for repetitive tasks. Our AI handles your chats, qualifies leads, and books meetings — 24/7, on autopilot.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Button 
                variant="hero" 
                size="lg" 
                onClick={scrollToContact}
                className="group text-lg px-8 py-6 shadow-xl shadow-iskra-emerald/20"
              >
                See If You Qualify
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="text-lg px-8 py-6 border-2 border-foreground/20 text-foreground hover:bg-foreground/10 hover:border-foreground/30"
              >
                How It Works
              </Button>
            </div>

            {/* Value props */}
            <div className="flex flex-wrap items-center gap-8 text-base">
              <div className="flex items-center gap-2 text-foreground/90">
                <Clock className="w-5 h-5 text-iskra-emerald" />
                <span className="font-medium">Save 40+ Hours/Week</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/90">
                <DollarSign className="w-5 h-5 text-iskra-emerald" />
                <span className="font-medium">Cut Costs by 70%</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/90">
                <Zap className="w-5 h-5 text-iskra-emerald" />
                <span className="font-medium">24/7 Response</span>
              </div>
            </div>
          </div>

          {/* Right Content - takes 5 columns */}
          <div className="lg:col-span-5 relative flex flex-col gap-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card rounded-2xl p-5 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.2s" }}>
                <div className="text-3xl lg:text-4xl font-bold text-iskra-emerald mb-1">3x</div>
                <div className="text-sm text-foreground/70 font-medium">More Bookings</div>
              </div>
              <div className="glass-card rounded-2xl p-5 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.3s" }}>
                <div className="text-3xl lg:text-4xl font-bold text-iskra-emerald mb-1">&lt;2min</div>
                <div className="text-sm text-foreground/70 font-medium">Avg Response</div>
              </div>
              <div className="glass-card rounded-2xl p-5 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.4s" }}>
                <div className="text-3xl lg:text-4xl font-bold text-iskra-emerald mb-1">90%</div>
                <div className="text-sm text-foreground/70 font-medium">Lead Capture</div>
              </div>
              <div className="glass-card rounded-2xl p-5 animate-fade-in border-iskra-emerald/20" style={{ animationDelay: "0.5s" }}>
                <div className="text-3xl lg:text-4xl font-bold text-iskra-emerald mb-1">$0</div>
                <div className="text-sm text-foreground/70 font-medium">Missed Revenue</div>
              </div>
            </div>
            
            {/* Live Counter Card */}
            <LiveCounter />
          </div>
        </div>
      </div>
    </section>
  );
};

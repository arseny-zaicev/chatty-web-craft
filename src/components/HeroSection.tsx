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
      
      <div className="container mx-auto px-4 py-16 md:py-24 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="relative z-10 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-iskra-emerald/10 border border-iskra-emerald/20 text-iskra-emerald text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              AI-Powered Automation
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              AI Agents That
              <br />
              <span className="text-gradient">Save You Time</span>
              <br />
              <span className="text-gradient">& Money</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-lg">
              Stop paying staff for repetitive tasks. Our AI handles your chats, qualifies leads, and books meetings — 24/7, on autopilot.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Button 
                variant="hero" 
                size="lg" 
                onClick={scrollToContact}
                className="group"
              >
                See If You Qualify
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                How It Works
              </Button>
            </div>

            {/* Value props */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-iskra-emerald" />
                <span>Save 40+ Hours/Week</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-iskra-emerald" />
                <span>Cut Costs by 70%</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-iskra-emerald" />
                <span>24/7 Response</span>
              </div>
            </div>
          </div>

          {/* Right Content - Live Counter Card */}
          <div className="relative flex flex-col items-center lg:items-end gap-6">
            {/* Floating stats cards */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
              <div className="glass-card rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <div className="text-3xl font-bold text-iskra-emerald mb-1">3x</div>
                <div className="text-sm text-muted-foreground">More Bookings</div>
              </div>
              <div className="glass-card rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <div className="text-3xl font-bold text-iskra-emerald mb-1">&lt;2min</div>
                <div className="text-sm text-muted-foreground">Avg Response</div>
              </div>
              <div className="glass-card rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "0.4s" }}>
                <div className="text-3xl font-bold text-iskra-emerald mb-1">90%</div>
                <div className="text-sm text-muted-foreground">Lead Capture</div>
              </div>
              <div className="glass-card rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "0.5s" }}>
                <div className="text-3xl font-bold text-iskra-emerald mb-1">$0</div>
                <div className="text-sm text-muted-foreground">Missed Revenue</div>
              </div>
            </div>
            
            {/* Live Counter Card */}
            <div className="w-full max-w-md">
              <LiveCounter />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

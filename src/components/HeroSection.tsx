import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { LiveCounter } from "@/components/LiveCounter";
import { ArrowRight } from "lucide-react";
import heroGlobe from "@/assets/hero-globe.png";

export const HeroSection = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden gradient-hero">
      <Sparkles count={30} />
      
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="relative z-10 animate-fade-in">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              The First Choice
              <br />
              for{" "}
              <span className="text-gradient">WhatsApp Outreach.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-lg">
              Send thousands of messages. Manage everything in one place.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Button 
                variant="hero" 
                size="lg" 
                onClick={scrollToContact}
                className="group"
              >
                Start Campaign
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="outline" size="lg">
                See How It Works
              </Button>
            </div>

            {/* Trust badges */}
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-iskra-emerald" />
                <span>7-Day Warm-Up</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-iskra-emerald" />
                <span>Worldwide Delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-iskra-emerald" />
                <span>99.8% Accuracy</span>
              </div>
            </div>
          </div>

          {/* Right Content - Globe and Counter */}
          <div className="relative flex flex-col items-center lg:items-end gap-6">
            <div className="relative w-full max-w-lg">
              <img
                src={heroGlobe}
                alt="Global WhatsApp outreach network visualization"
                className="w-full h-auto animate-float"
              />
              {/* Glow effect */}
              <div className="absolute inset-0 bg-iskra-emerald/10 blur-3xl rounded-full -z-10" />
            </div>
            
            {/* Live Counter Card */}
            <div className="w-full max-w-sm">
              <LiveCounter />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

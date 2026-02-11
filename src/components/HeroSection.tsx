import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight, Zap, Bell } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

const NOTIFICATIONS = [
  { type: "positive", text: '"Yes, I\'m interested. When can we talk?"' },
  { type: "booked", text: "Meeting booked — Tomorrow 2:00 PM" },
  { type: "positive", text: '"Send me more details please"' },
  { type: "booked", text: "Meeting booked — Thursday 11:00 AM" },
  { type: "positive", text: '"This is exactly what we need"' },
  { type: "reply", text: '"Can you call me at 3pm?"' },
  { type: "booked", text: "Meeting booked — Monday 10:30 AM" },
  { type: "positive", text: '"Very interested, let\'s discuss"' },
];

const LiveDashboard = () => {
  const [count, setCount] = useState(10405);
  const [recentReplies, setRecentReplies] = useState(247);
  const [notifIndex, setNotifIndex] = useState(0);
  const [notifVisible, setNotifVisible] = useState(true);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setCount(prev => prev + Math.floor(Math.random() * 3) + 1);
    }, 3000 + Math.random() * 2000);
    
    const replyInterval = setInterval(() => {
      setRecentReplies(prev => prev + 1);
    }, 8000 + Math.random() * 4000);

    const notifInterval = setInterval(() => {
      setNotifVisible(false);
      setTimeout(() => {
        setNotifIndex(prev => (prev + 1) % NOTIFICATIONS.length);
        setNotifVisible(true);
      }, 400);
    }, 4000);
    
    return () => {
      clearInterval(msgInterval);
      clearInterval(replyInterval);
      clearInterval(notifInterval);
    };
  }, []);

  const formattedCount = count.toLocaleString('en-US').replace(/,/g, ' ');
  const currentNotif = NOTIFICATIONS[notifIndex];

  return (
    <div className="relative animate-fade-in" style={{ animationDelay: "0.3s" }}>
      {/* Ambient glow behind card */}
      <div className="absolute -inset-4 bg-iskra-emerald/5 rounded-3xl blur-2xl" />
      
      <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-iskra-emerald opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-iskra-emerald" />
            </span>
            <span className="text-xs font-medium text-foreground/50 uppercase tracking-wider">ISKRA System · Live</span>
          </div>
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-4 divide-x divide-border/30">
          {[
            { value: "4x", label: "ROI" },
            { value: "2m", label: "Response" },
            { value: "35%", label: "Reply Rate" },
            { value: "98%", label: "Delivery" },
          ].map((stat) => (
            <div key={stat.label} className="px-4 py-4 text-center group">
              <div className="text-lg lg:text-xl font-bold text-iskra-emerald font-headline transition-colors">
                {stat.value}
              </div>
              <div className="text-[10px] lg:text-xs text-foreground/40 mt-0.5 uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-iskra-emerald/20 to-transparent" />

        {/* Live counter section */}
        <div className="px-5 py-5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-foreground/40">Messages Sent</span>
            <span className="text-[10px] text-iskra-emerald font-medium">98% delivered</span>
          </div>
          <div className="text-4xl lg:text-5xl font-bold text-foreground font-headline tracking-tight tabular-nums transition-all duration-500">
            {formattedCount}
          </div>
        </div>

        {/* Push notification */}
        <div className="px-4 py-3 bg-iskra-emerald/5 border-t border-border/30 overflow-hidden min-h-[52px]">
          <div
            className="flex items-center gap-2.5 transition-all duration-400"
            style={{
              opacity: notifVisible ? 1 : 0,
              transform: notifVisible ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-iskra-emerald/15 flex items-center justify-center">
              <Bell className="w-3 h-3 text-iskra-emerald" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-iskra-emerald font-semibold uppercase tracking-wide">ISKRA Leads</div>
              <div className="text-xs text-foreground/60 truncate">{currentNotif.text}</div>
            </div>
            <span className="text-[9px] text-foreground/25 flex-shrink-0 ml-auto">now</span>
          </div>
        </div>
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
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="flex-1 max-w-2xl">
            <p className="text-foreground/60 text-sm md:text-base uppercase tracking-widest mb-4 animate-fade-in">
              WhatsApp Outreach Infrastructure
            </p>
            
            <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.1] mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <span className="text-foreground">WhatsApp Booking</span>
              <br />
              <span className="text-foreground">Engine that </span>
              <span className="text-iskra-emerald whitespace-nowrap">f*cking works.</span>
            </h1>
            
            <p className="text-base md:text-lg text-foreground/70 mb-8 max-w-lg leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
              Dedicated sending accounts. Proven copy sequences. Full funnel tracking. AI layer when you're ready.
            </p>

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

          {/* Right Content - Live Dashboard */}
          <div className="w-full lg:w-auto lg:min-w-[380px] lg:max-w-[420px]">
            <LiveDashboard />
          </div>
        </div>
      </div>
    </section>
  );
};

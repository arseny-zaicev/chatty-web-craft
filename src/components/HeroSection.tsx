import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight } from "lucide-react";
import { SketchUnderline } from "@/components/SketchElements";
import mariaAvatar from "@/assets/maria-avatar.avif";

const WhatsAppMockup = () => (
  <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
    {/* Sender profile card */}
    <div
      style={{
        maxWidth: "400px",
        margin: "0 auto 8px",
        borderRadius: "1rem",
        background: "#fff",
        border: "1px solid hsl(0 0% 80%)",
        boxShadow: "0 4px 20px hsl(0 0% 0% / 0.08)",
        padding: "0.85rem 1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <rect width="24" height="24" rx="6" fill="hsl(142 70% 40%)" />
        <path d="M12 4C7.58 4 4 7.58 4 12c0 1.42.38 2.75 1.04 3.9L4 20l4.22-1.01A7.94 7.94 0 0 0 12 20c4.42 0 8-3.58 8-8s-3.58-8-8-8zm3.9 11.1c-.17.47-1 .9-1.37.96-.37.06-.84.08-1.35-.09-.31-.1-.7-.23-1.2-.46-2.1-.93-3.47-3.05-3.57-3.19-.1-.14-.83-1.1-.83-2.1 0-.99.52-1.48.71-1.68.19-.2.41-.25.55-.25h.4c.13 0 .3-.05.47.36.17.41.58 1.4.63 1.5.05.1.08.22.01.35-.07.13-.1.21-.2.33-.1.11-.21.25-.3.33-.1.09-.2.19-.09.38.11.19.5.83 1.08 1.35.74.67 1.37.88 1.56.98.19.1.3.08.41-.05.11-.13.47-.55.6-.74.13-.19.26-.16.44-.1.18.06 1.17.55 1.37.65.2.1.33.15.38.23.05.08.05.47-.12.94z" fill="white" />
      </svg>
      <div style={{ width: "40px", height: "40px", borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid hsl(0 0% 85%)" }}>
        <img src={mariaAvatar} alt="Maria" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="eager" decoding="sync" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "hsl(0 0% 12%)", lineHeight: 1.2 }}>Maria</div>
        <div style={{ fontSize: "0.65rem", color: "hsl(0 0% 52%)", marginTop: "2px" }}>+44 7*** *** *** · Personal account</div>
      </div>
      <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "hsl(142 55% 32%)", background: "hsl(142 60% 92%)", border: "1px solid hsl(142 50% 78%)", borderRadius: "999px", padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
        Personal
      </div>
    </div>

    {/* Arrow */}
    <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 50%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
      </svg>
    </div>

    {/* Phone shell */}
    <div style={{ borderRadius: "1.25rem", overflow: "hidden", boxShadow: "0 12px 56px hsl(0 0% 0% / 0.2), 0 2px 8px hsl(0 0% 0% / 0.08)", border: "1px solid hsl(0 0% 70%)", maxWidth: "400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ background: "hsl(152 52% 30%)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <svg width="10" height="17" viewBox="0 0 10 17" fill="none" style={{ opacity: 0.9, flexShrink: 0 }}>
          <path d="M9 1L1.5 8.5L9 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "hsl(0 0% 70%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" opacity="0.9">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontSize: "0.82rem", fontWeight: 600, lineHeight: 1.2 }}>+44 7*** *** ***</div>
          <div style={{ color: "hsl(142 60% 80%)", fontSize: "0.62rem" }}>online</div>
        </div>
        <div style={{ display: "flex", gap: "0.9rem", opacity: 0.85 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 9.5 19.79 19.79 0 0 1 1.64 4.09 2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91A16 16 0 0 0 13 14.91l.82-.82a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
        </div>
      </div>

      {/* Chat */}
      <div style={{ background: "hsl(36 28% 88%)", padding: "1rem 0.85rem", minHeight: "200px", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {/* Outgoing message */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ background: "hsl(105 40% 82%)", color: "hsl(0 0% 12%)", maxWidth: "88%", padding: "0.55rem 0.75rem 0.4rem", borderRadius: "0.75rem 0.1rem 0.75rem 0.75rem", fontSize: "0.8rem", lineHeight: 1.45, boxShadow: "0 1px 2px hsl(0 0% 0% / 0.08)" }}>
            Hey there James, Maria here. I work at ISKRA. Tried reaching you last week about a WhatsApp outreach strategy we ran for a similar firm. A few clients already booked 6-8 calls from their first 500 messages. Can I show you how?
            <div style={{ textAlign: "right", marginTop: "4px", fontSize: "0.6rem", color: "hsl(0 0% 40%)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "3px" }}>
              11:42
              <svg width="14" height="9" viewBox="0 0 16 11" fill="none">
                <path d="M1 5.5L5 9.5L11 1.5" stroke="hsl(207 90% 54%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 5.5L9 9.5L15 1.5" stroke="hsl(207 90% 54%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Reply */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{ background: "#fff", color: "hsl(0 0% 12%)", maxWidth: "72%", padding: "0.55rem 0.75rem 0.4rem", borderRadius: "0.1rem 0.75rem 0.75rem 0.75rem", fontSize: "0.8rem", lineHeight: 1.45, boxShadow: "0 1px 2px hsl(0 0% 0% / 0.08)" }}>
            Interesting, tell me more 👀
            <div style={{ textAlign: "right", marginTop: "4px", fontSize: "0.6rem", color: "hsl(0 0% 55%)" }}>11:45</div>
          </div>
        </div>

        {/* Typing indicator */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ background: "hsl(105 40% 82%)", padding: "0.55rem 0.85rem", borderRadius: "0.75rem 0.1rem 0.75rem 0.75rem", boxShadow: "0 1px 2px hsl(0 0% 0% / 0.08)" }}>
            <span style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
              <span className="typing-dot" style={{ "--d": "0ms" } as React.CSSProperties} />
              <span className="typing-dot" style={{ "--d": "150ms" } as React.CSSProperties} />
              <span className="typing-dot" style={{ "--d": "300ms" } as React.CSSProperties} />
            </span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: "hsl(36 20% 92%)", padding: "0.6rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", borderTop: "1px solid hsl(0 0% 82%)" }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: "1.5rem", padding: "0.45rem 0.85rem", fontSize: "0.75rem", color: "hsl(0 0% 55%)", boxShadow: "0 1px 2px hsl(0 0% 0% / 0.06)" }}>Message</div>
        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "hsl(152 52% 30%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
      </div>
    </div>

    <p className="text-center text-xs mt-2 italic text-muted-foreground/50">
      Example message. Actual copy is tailored per client and niche.
    </p>
  </div>
);

const HERO_BULLETS = ["Cold outreach at scale", "Warm lead follow-up", "CRM reactivation"];

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
    <section className="relative min-h-[90vh] flex items-center pt-24 overflow-hidden">
      <AnimatedBackground />
      <Sparkles count={15} />

      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60 z-[1]" />

      <div className="container mx-auto px-6 md:px-12 lg:px-16 xl:px-24 py-12 md:py-16 relative z-10">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-12 items-center">
          {/* Left */}
          <div className="flex-1 max-w-xl lg:max-w-[540px]">
            <p className="text-foreground/50 text-xs md:text-sm uppercase tracking-[0.2em] mb-5 animate-fade-in font-medium">
              WhatsApp Outreach Infrastructure
            </p>

            <h1 className="font-headline text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-bold leading-[1.1] mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <span className="text-foreground">Scale WhatsApp outreach</span>
              <br />
              <span className="inline-block overflow-hidden">
                <span className="text-iskra-emerald">without burning accounts.</span>
                <span style={{ display: 'block', marginTop: '-4px' }}>
                  <SketchUnderline color="hsl(152 50% 36%)" delay={0.5} />
                </span>
              </span>
            </h1>

            <p className="text-base md:text-lg text-foreground/65 mb-8 max-w-md leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
              Send cold campaigns, follow up warm leads, and reactivate old CRM lists with dedicated sending accounts, proven sequences, and full funnel tracking.
            </p>

            <div className="animate-fade-in mb-8" style={{ animationDelay: "0.3s" }}>
              <Button
                onClick={scrollToDemo}
                className="group text-base px-8 py-6 bg-iskra-emerald hover:bg-iskra-emerald/90 text-background rounded-xl font-semibold shadow-xl shadow-iskra-emerald/20 btn-shimmer"
              >
                Book a Demo
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform relative z-10" />
              </Button>
            </div>

            <HeroBullets />
          </div>

          {/* Right — WhatsApp Mockup */}
          <div className="w-full lg:w-auto lg:flex-1 lg:max-w-[400px] lg:translate-x-4 xl:translate-x-8">
            <WhatsAppMockup />
          </div>
        </div>
      </div>
    </section>
  );
};

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight, Shield } from "lucide-react";
import { motion } from "framer-motion";

const HERO_BULLETS = ["Cold outreach at scale", "Warm lead follow-up", "Database reactivation"];

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay },
});

const HeroBullets = () => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % HERO_BULLETS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-wrap gap-3">
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

const WhatsAppMockup = memo(() => (
  <motion.div
    initial={{ opacity: 0, x: 40 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.6, delay: 0.25 }}
  >
    {/* Phone shell */}
    <div style={{ borderRadius: '1.25rem', overflow: 'hidden', boxShadow: '0 12px 56px hsl(0 0% 0% / 0.3), 0 2px 8px hsl(0 0% 0% / 0.15)', border: '1px solid hsl(0 0% 20%)', maxWidth: '400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: 'hsl(152 52% 28%)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <svg width="10" height="17" viewBox="0 0 10 17" fill="none" style={{ opacity: 0.9, flexShrink: 0 }}>
          <path d="M9 1L1.5 8.5L9 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'hsl(0 0% 40%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" opacity="0.9">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.2 }}>+971 5*** *** ***</div>
          <div style={{ color: 'hsl(142 60% 75%)', fontSize: '0.62rem' }}>online</div>
        </div>
        <div style={{ display: 'flex', gap: '0.9rem', opacity: 0.85 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 9.5 19.79 19.79 0 0 1 1.64 4.09 2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91A16 16 0 0 0 13 14.91l.82-.82a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
          </svg>
        </div>
      </div>

      {/* Chat body */}
      <div style={{ background: 'hsl(220 15% 14%)', padding: '1rem 0.85rem', minHeight: '200px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {/* Outbound message */}
        <motion.div style={{ display: 'flex', justifyContent: 'flex-end' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.4 }}>
          <div style={{ background: 'hsl(152 40% 22%)', color: 'hsl(0 0% 90%)', maxWidth: '88%', padding: '0.55rem 0.75rem 0.4rem', borderRadius: '0.75rem 0.1rem 0.75rem 0.75rem', fontSize: '0.8rem', lineHeight: 1.45, boxShadow: '0 1px 2px hsl(0 0% 0% / 0.15)' }}>
            Hey James! We help agencies like yours book 15-20 extra calls/month via WhatsApp outreach. Already running this for 3 similar firms in Dubai. Worth a quick look?
            <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '0.6rem', color: 'hsl(0 0% 50%)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px' }}>
              11:42
              <svg width="14" height="9" viewBox="0 0 16 11" fill="none">
                <path d="M1 5.5L5 9.5L11 1.5" stroke="hsl(207 90% 54%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5.5L9 9.5L15 1.5" stroke="hsl(207 90% 54%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </motion.div>

        {/* Reply */}
        <motion.div style={{ display: 'flex', justifyContent: 'flex-start' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.4 }}>
          <div style={{ background: 'hsl(220 15% 20%)', color: 'hsl(0 0% 90%)', maxWidth: '72%', padding: '0.55rem 0.75rem 0.4rem', borderRadius: '0.1rem 0.75rem 0.75rem 0.75rem', fontSize: '0.8rem', lineHeight: 1.45, boxShadow: '0 1px 2px hsl(0 0% 0% / 0.1)' }}>
            Interesting, tell me more 👀
            <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '0.6rem', color: 'hsl(0 0% 45%)' }}>11:45</div>
          </div>
        </motion.div>

        {/* Typing indicator */}
        <motion.div style={{ display: 'flex', justifyContent: 'flex-end' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.35 }}>
          <div style={{ background: 'hsl(152 40% 22%)', padding: '0.55rem 0.85rem', borderRadius: '0.75rem 0.1rem 0.75rem 0.75rem', boxShadow: '0 1px 2px hsl(0 0% 0% / 0.1)' }}>
            <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
              <span className="typing-dot" style={{ '--d': '0ms' } as React.CSSProperties} />
              <span className="typing-dot" style={{ '--d': '150ms' } as React.CSSProperties} />
              <span className="typing-dot" style={{ '--d': '300ms' } as React.CSSProperties} />
            </span>
          </div>
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'hsl(220 15% 12%)', padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid hsl(0 0% 18%)' }}>
        <div style={{ flex: 1, background: 'hsl(220 15% 18%)', borderRadius: '1.5rem', padding: '0.45rem 0.85rem', fontSize: '0.75rem', color: 'hsl(0 0% 45%)' }}>Message</div>
        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'hsl(152 52% 30%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
      </div>
    </div>

    <p className="text-center text-xs mt-2 italic text-muted-foreground/50">
      Example message. Actual copy is tailored per client.
    </p>
  </motion.div>
));

WhatsAppMockup.displayName = 'WhatsAppMockup';

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
        <div className="grid lg:grid-cols-[1fr_480px] gap-12 items-center">
          {/* Left — copy */}
          <div>
            <motion.p
              className="text-foreground/50 text-xs md:text-sm uppercase tracking-[0.2em] mb-6 font-medium"
              {...fadeUp(0)}
            >
              WhatsApp Outreach Infrastructure
            </motion.p>

            <motion.h1
              className="font-headline mb-4"
              style={{
                fontSize: "clamp(2.4rem, 4.5vw, 3.75rem)",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="text-foreground">Scale WhatsApp outreach </span>
              <span className="text-iskra-emerald">without burning accounts.</span>
            </motion.h1>

            <motion.p className="text-lg font-semibold mb-2 text-foreground" {...fadeUp(0.3)}>
              Predictable pipeline from WhatsApp.
            </motion.p>

            <motion.p className="mb-8 leading-relaxed text-muted-foreground" {...fadeUp(0.4)}>
              Send cold campaigns, follow up warm leads, and reactivate old CRM
              lists — with dedicated sending accounts, proven sequences, and full
              funnel tracking.
            </motion.p>

            <motion.div className="mb-8" {...fadeUp(0.5)}>
              <HeroBullets />
            </motion.div>

            <motion.div className="flex flex-wrap gap-3 mb-8" {...fadeUp(0.55)}>
              <Button
                onClick={scrollToDemo}
                variant="outline"
                className="group text-sm px-7 py-3.5 h-auto rounded-xl font-semibold tracking-wide border-border hover:border-iskra-emerald hover:text-iskra-emerald hover:bg-iskra-emerald/[0.04] transition-all duration-200"
              >
                Book a Demo
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>

            <motion.div className="flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
              <Shield size={14} className="text-iskra-emerald" />
              <p className="text-sm text-muted-foreground">
                NDA on every engagement · <strong className="text-foreground">Performance-oriented</strong>
              </p>
            </motion.div>
          </div>

          {/* Right — WhatsApp mockup */}
          <div className="hidden lg:block">
            <WhatsAppMockup />
          </div>
        </div>
      </div>
    </section>
  );
};

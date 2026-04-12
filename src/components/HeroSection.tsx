import { useState, useEffect, memo } from "react";
import { Sparkles } from "@/components/Sparkles";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

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
    transition={{ duration: 0.6, delay: 0.5 }}
  >
    <div style={{ borderRadius: '1.25rem', overflow: 'hidden', boxShadow: '0 12px 56px hsl(0 0% 0% / 0.3), 0 2px 8px hsl(0 0% 0% / 0.15)', border: '1px solid hsl(0 0% 20%)', maxWidth: '380px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: 'hsl(152 52% 28%)', padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <svg width="10" height="17" viewBox="0 0 10 17" fill="none" style={{ opacity: 0.9, flexShrink: 0 }}>
          <path d="M9 1L1.5 8.5L9 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'hsl(0 0% 40%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white" opacity="0.9">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>+971 5*** *** ***</div>
          <div style={{ color: 'hsl(142 60% 75%)', fontSize: '0.6rem' }}>online</div>
        </div>
      </div>

      {/* Chat body */}
      <div style={{ background: 'hsl(220 15% 14%)', padding: '0.85rem 0.75rem', minHeight: '180px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Outbound */}
        <motion.div style={{ display: 'flex', justifyContent: 'flex-end' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.4 }}>
          <div style={{ background: 'hsl(152 40% 22%)', color: 'hsl(0 0% 90%)', maxWidth: '88%', padding: '0.5rem 0.7rem 0.35rem', borderRadius: '0.7rem 0.1rem 0.7rem 0.7rem', fontSize: '0.75rem', lineHeight: 1.45, boxShadow: '0 1px 2px hsl(0 0% 0% / 0.15)' }}>
            Hey James! We help agencies like yours book 15-20 extra calls/month via WhatsApp outreach. Already running this for 3 similar firms in Dubai. Worth a quick look?
            <div style={{ textAlign: 'right', marginTop: '3px', fontSize: '0.58rem', color: 'hsl(0 0% 50%)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px' }}>
              11:42
              <svg width="13" height="8" viewBox="0 0 16 11" fill="none">
                <path d="M1 5.5L5 9.5L11 1.5" stroke="hsl(207 90% 54%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5.5L9 9.5L15 1.5" stroke="hsl(207 90% 54%)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </motion.div>

        {/* Reply */}
        <motion.div style={{ display: 'flex', justifyContent: 'flex-start' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.4 }}>
          <div style={{ background: 'hsl(220 15% 20%)', color: 'hsl(0 0% 90%)', maxWidth: '72%', padding: '0.5rem 0.7rem 0.35rem', borderRadius: '0.1rem 0.7rem 0.7rem 0.7rem', fontSize: '0.75rem', lineHeight: 1.45 }}>
            Interesting, tell me more 👀
            <div style={{ textAlign: 'right', marginTop: '3px', fontSize: '0.58rem', color: 'hsl(0 0% 45%)' }}>11:45</div>
          </div>
        </motion.div>

        {/* Typing */}
        <motion.div style={{ display: 'flex', justifyContent: 'flex-end' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.35 }}>
          <div style={{ background: 'hsl(152 40% 22%)', padding: '0.5rem 0.8rem', borderRadius: '0.7rem 0.1rem 0.7rem 0.7rem' }}>
            <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
              <span className="typing-dot" style={{ '--d': '0ms' } as React.CSSProperties} />
              <span className="typing-dot" style={{ '--d': '150ms' } as React.CSSProperties} />
              <span className="typing-dot" style={{ '--d': '300ms' } as React.CSSProperties} />
            </span>
          </div>
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'hsl(220 15% 12%)', padding: '0.5rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid hsl(0 0% 18%)' }}>
        <div style={{ flex: 1, background: 'hsl(220 15% 18%)', borderRadius: '1.5rem', padding: '0.4rem 0.75rem', fontSize: '0.7rem', color: 'hsl(0 0% 45%)' }}>Message</div>
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'hsl(152 52% 30%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        <div className="grid lg:grid-cols-[1fr_380px] gap-16 items-center">
          {/* Left — copy (LP style) */}
          <div>
            {/* Eyebrow */}
            <motion.p
              className="text-xs md:text-sm tracking-[0.2em] uppercase mb-16 md:mb-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <span className="text-iskra-emerald font-semibold">ISKRA</span>
              <span className="font-light text-foreground/50"> · WhatsApp Outreach Infrastructure</span>
            </motion.p>

            {/* Headline — LP style: huge, tight */}
            <motion.h1
              className="font-headline max-w-3xl mb-8"
              style={{
                fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <span className="text-foreground">Scale WhatsApp outreach </span>
              <span className="text-iskra-emerald">without burning accounts.</span>
            </motion.h1>

            {/* Divider — LP style */}
            <motion.div
              className="w-16 h-[1px] bg-border/60 mb-8"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              style={{ transformOrigin: 'left' }}
            />

            {/* Supporting paragraph — LP style: light, large */}
            <motion.p
              className="text-lg md:text-xl text-muted-foreground max-w-xl mb-12 leading-relaxed font-light"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7 }}
            >
              Send cold campaigns, follow up warm leads, and reactivate old CRM
              lists — with dedicated sending accounts, proven sequences, and full
              funnel tracking.
            </motion.p>

            {/* Bullets */}
            <motion.div
              className="mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.8 }}
            >
              <HeroBullets />
            </motion.div>

            {/* CTA — LP btn-outline-white style adapted */}
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.9 }}
            >
              <button
                onClick={scrollToDemo}
                className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-semibold tracking-wide rounded-xl border transition-all duration-200 border-foreground/30 text-foreground hover:border-iskra-emerald hover:text-iskra-emerald hover:bg-iskra-emerald/[0.04]"
              >
                Book a Demo
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>

            {/* Qualifier — LP style */}
            <motion.p
              className="text-sm text-muted-foreground/50 max-w-md leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ duration: 0.7, delay: 1.0 }}
            >
              NDA on every engagement · Performance-oriented · Built for agencies & B2B firms in Dubai.
            </motion.p>
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

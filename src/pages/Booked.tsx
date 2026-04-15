import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, MessageCircle, Quote, Shield, Zap, Send, RefreshCw, Flame, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import kristapsPhoto from "@/assets/testimonials/kristaps.webp";
import founderPhoto from "@/assets/founder/arsenijs-new.png";

const stats = [
  { value: "1M+", label: "Messages Sent" },
  { value: "35%", label: "Reply Rate" },
  { value: "98%", label: "Delivery Rate" },
  { value: "1%", label: "Booking on Cold" },
];

const services = [
  {
    icon: Flame,
    title: "Warm Traffic",
    description: "Turn your inbound leads into booked calls with WhatsApp follow-ups after ads or events.",
  },
  {
    icon: RefreshCw,
    title: "Database Reactivation",
    description: "Bring old contacts back to life - CRM lists, past clients, leads that went cold months ago.",
  },
  {
    icon: Send,
    title: "Cold Outreach",
    description: "Reach new prospects at scale with personalized messages that actually get replies.",
  },
  {
    icon: Ban,
    title: "Zero Blocks",
    description: "Dedicated infrastructure, number warmup, and anti-block systems. Your number stays safe.",
  },
];

const CALENDLY_URL = "https://calendly.com/arseny-iskra/iskra-ae-whatsapp-outreach";

const Booked = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const utmParams: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((key) => {
      const val = searchParams.get(key);
      if (val) utmParams[key] = val;
    });
    if (Object.keys(utmParams).length > 0) {
      sessionStorage.setItem("iskra_utm", JSON.stringify(utmParams));
    }
  }, [searchParams]);

  const getCalendlyUrl = () => {
    const params = new URLSearchParams();
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    });
    const qs = params.toString();
    return qs ? `${CALENDLY_URL}?${qs}` : CALENDLY_URL;
  };

  return (
    <>
      <Helmet>
        <title>Book a Call - WhatsApp Outreach | ISKRA</title>
        <meta name="description" content="Book a free strategy call to learn how WhatsApp outreach can fill your pipeline with qualified meetings." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="min-h-screen bg-background">
        {/* Header */}
        <header className="py-6 border-b border-border/50">
          <div className="container mx-auto px-4">
            <Link to="/" className="flex items-center gap-2 w-fit">
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
                <circle cx="32" cy="32" r="4.5" fill="currentColor"/>
                <line x1="32" y1="8" x2="32" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="32" y1="42" x2="32" y2="56" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="8" y1="32" x2="22" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="42" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="15" y1="15" x2="24" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="40" y1="40" x2="49" y2="49" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="49" y1="15" x2="40" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="24" y1="40" x2="15" y2="49" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              <span className="font-display text-xl font-bold tracking-tight text-foreground">ISKRA</span>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="pt-16 pb-12 px-4">
          <div className="container mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-iskra-emerald/10 border border-iskra-emerald/30 mb-8">
              <Zap className="w-4 h-4 text-iskra-emerald" />
              <span className="text-iskra-emerald font-semibold text-sm">Free Strategy Call</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-[1.05] font-display mb-5">
              WhatsApp outreach<br />
              <span className="text-iskra-emerald">that actually books meetings</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
              We fill your calendar with qualified prospects through WhatsApp. Warm follow-ups, database reactivation, cold outreach - pick a time and let's map out your strategy.
            </p>

            <a href="#calendly">
              <Button variant="cta" size="xl" className="gap-2">
                Pick a Time
                <CheckCircle2 className="w-5 h-5" />
              </Button>
            </a>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="py-10 px-4 bg-foreground">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-iskra-emerald font-display">{value}</p>
                  <p className="text-background/60 text-sm mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What We Do */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <p className="text-iskra-emerald text-xs font-semibold uppercase tracking-widest mb-2">What We Do</p>
              <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">Three campaign types, one system</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {services.map(({ icon: Icon, title, description }) => (
                <div key={title} className="p-6 card-light hover:border-iskra-emerald/40 transition-colors rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-iskra-emerald" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Case Study */}
        <section className="py-16 px-4 bg-card">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <p className="text-iskra-emerald text-xs font-semibold uppercase tracking-widest mb-2">Case Study</p>
              <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">Real client, real numbers</h2>
            </div>

            <div className="card-champagne rounded-2xl overflow-hidden">
              <div className="grid md:grid-cols-5 gap-0">
                <div className="md:col-span-2 p-6">
                  <div className="rounded-xl overflow-hidden border border-border aspect-video relative">
                    <video
                      src="https://xglfamaaotmwulglwcui.supabase.co/storage/v1/object/public/testimonials/kristaps-testimonial.mp4"
                      poster={kristapsPhoto}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover absolute inset-0"
                    />
                  </div>
                </div>

                <div className="md:col-span-3 p-6 md:pl-2 flex flex-col justify-center">
                  <Quote className="w-8 h-8 text-iskra-emerald/20 mb-3" />
                  <blockquote className="text-lg md:text-xl font-semibold text-foreground leading-snug mb-5">
                    "Arsenijs helped create amazing copy that brought 8 meetings in just 2 days. Highly recommend working with him!"
                  </blockquote>

                  <div className="flex items-center gap-3 mb-5">
                    <img src={kristapsPhoto} alt="Kristaps" className="w-10 h-10 rounded-full object-cover object-top border-2 border-iskra-emerald/20" />
                    <div>
                      <p className="font-semibold text-foreground text-sm">Kristaps</p>
                      <p className="text-muted-foreground text-xs">
                        Founder,{" "}
                        <a href="https://key-digital.lv" target="_blank" rel="noopener noreferrer" className="text-iskra-emerald hover:underline">
                          key-digital.lv
                        </a>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-card rounded-xl p-3 border border-border text-center">
                      <p className="text-xl font-bold text-iskra-emerald font-display">500</p>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mt-0.5">Messages</p>
                    </div>
                    <div className="bg-card rounded-xl p-3 border border-border text-center">
                      <p className="text-xl font-bold text-iskra-emerald font-display">8</p>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mt-0.5">Meetings</p>
                    </div>
                    <div className="bg-card rounded-xl p-3 border border-border text-center">
                      <p className="text-xl font-bold text-iskra-emerald font-display">2d</p>
                      <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium mt-0.5">Timeline</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Founder */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="flex flex-col md:flex-row items-center gap-8 p-8 card-light rounded-2xl">
              <div className="flex-shrink-0">
                <div className="w-36 h-36 md:w-44 md:h-44 rounded-2xl overflow-hidden border-2 border-iskra-emerald/20">
                  <img src={founderPhoto} alt="Arsenijs - ISKRA Founder" className="w-full h-full object-cover object-top" />
                </div>
              </div>
              <div className="text-center md:text-left flex-1">
                <h3 className="font-bold text-xl font-display text-foreground mb-1">You'll be speaking with Arsenijs</h3>
                <p className="text-iskra-emerald text-sm font-medium mb-3">Founder, ISKRA</p>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  Sent over 1M+ WhatsApp messages across B2B, SaaS, coaching, real estate and more. Built outreach systems that generated <span className="text-iskra-emerald font-semibold">3M+ AED</span> in pipeline. No fluff - just strategies that work.
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  <span className="px-3 py-1.5 rounded-full bg-muted text-foreground/70 text-xs font-medium">1M+ Messages</span>
                  <span className="px-3 py-1.5 rounded-full bg-iskra-emerald/10 text-iskra-emerald text-xs font-medium">3M+ AED Pipeline</span>
                  <span className="px-3 py-1.5 rounded-full bg-muted text-foreground/70 text-xs font-medium">10+ Industries</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Calendly Embed */}
        <section id="calendly" className="py-16 px-4 bg-foreground">
          <div className="container mx-auto max-w-3xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-background font-display mb-3">
                Pick a time that works
              </h2>
              <p className="text-background/60 text-sm">
                30 minutes. We'll break down your situation and map out a launch plan.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden bg-background shadow-xl">
              <iframe
                src={getCalendlyUrl()}
                width="100%"
                height="700"
                frameBorder="0"
                title="Schedule a call with ISKRA"
                className="w-full"
              />
            </div>
          </div>
        </section>

        {/* WhatsApp CTA */}
        <section className="py-12 px-4">
          <div className="container mx-auto max-w-2xl text-center">
            <Shield className="w-10 h-10 text-iskra-emerald mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-display mb-3">
              Got questions?
            </h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Drop me a message - I usually reply within minutes.
            </p>
            <a href="https://wa.me/971568785008" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-[#25D366] hover:bg-[#20BD5A] text-primary-foreground gap-2 text-lg px-8 py-6 shadow-lg">
                <MessageCircle className="w-5 h-5" />
                Message on WhatsApp
              </Button>
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-border/50">
          <div className="container mx-auto px-4 text-center">
            <p className="text-muted-foreground text-sm">© {new Date().getFullYear()} ISKRA. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </>
  );
};

export default Booked;

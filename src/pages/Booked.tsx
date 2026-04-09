import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Sparkles, Mail, Play, CheckCircle2, MessageCircle, Quote, TrendingUp, Users, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import kristapsPhoto from "@/assets/testimonials/kristaps.webp";
import founderPhoto from "@/assets/founder/arsenijs-new.png";

const stats = [
  { value: "1M+", label: "Messages Sent" },
  { value: "35%", label: "Avg Reply Rate" },
  { value: "98%", label: "Delivery Rate" },
  { value: "10+", label: "Industries Served" },
];

const expectations = [
  {
    icon: TrendingUp,
    title: "Your Growth Goals",
    description: "We'll understand your pipeline targets, deal size, and what success looks like for you.",
  },
  {
    icon: Users,
    title: "Campaign Strategy",
    description: "Which campaign type fits — warm traffic, reactivation, or cold outreach — and how to structure it.",
  },
  {
    icon: Shield,
    title: "Infrastructure & Timeline",
    description: "How we set up dedicated accounts, warmup, and anti-block systems — and when you can expect results.",
  },
];

const Booked = () => {
  const [isTestimonialPlaying, setIsTestimonialPlaying] = useState(false);

  return (
    <>
      <Helmet>
        <title>Call Confirmed | ISKRA</title>
        <meta name="description" content="Your call with ISKRA is confirmed. Prepare for our meeting." />
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
              <CheckCircle2 className="w-5 h-5 text-iskra-emerald" />
              <span className="text-iskra-emerald font-semibold text-sm">Call Booked Successfully</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight font-display mb-4">
              While You Wait
            </h1>
            <p className="text-muted-foreground text-lg max-w-lg mx-auto">
              Watch how other businesses are generating pipeline with WhatsApp outreach.
            </p>
          </div>
        </section>

        {/* Quick Steps */}
        <section className="pb-12 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-4 p-5 rounded-2xl card-light">
                <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-iskra-emerald" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iskra-emerald mb-1">Step 1</p>
                  <p className="font-semibold text-foreground text-sm">Accept the Calendar Invite</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Check your inbox and confirm</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 rounded-2xl card-light">
                <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center flex-shrink-0">
                  <Play className="w-5 h-5 text-iskra-emerald ml-0.5" fill="currentColor" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iskra-emerald mb-1">Step 2</p>
                  <p className="font-semibold text-foreground text-sm">Watch the Video Below</p>
                  <p className="text-muted-foreground text-xs mt-0.5">So we skip the basics on the call</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Video Placeholder */}
        <section className="pb-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-xl bg-white">
              <div className="relative w-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200" style={{ paddingBottom: "56.25%" }}>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                  <div className="w-20 h-20 rounded-full bg-iskra-emerald/10 border-2 border-dashed border-iskra-emerald/30 flex items-center justify-center mb-4">
                    <Play className="w-8 h-8 text-iskra-emerald/50 ml-1" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">Video coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="py-12 px-4 bg-foreground">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-iskra-emerald font-display">{value}</p>
                  <p className="text-muted-foreground/70 text-sm mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What to Expect */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">What We'll Cover on the Call</h2>
              <p className="text-muted-foreground mt-2">30 minutes. No fluff. Actionable plan.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {expectations.map(({ icon: Icon, title, description }) => (
                <div key={title} className="text-center p-6 card-light hover:border-iskra-emerald/40 transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-iskra-emerald/10 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-iskra-emerald" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">{title}</h3>
                  <p className="text-muted-foreground text-sm">{description}</p>
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
              <h2 className="text-2xl md:text-3xl font-bold font-display text-foreground">Real Client, Real Results</h2>
            </div>

            <div className="card-champagne rounded-2xl overflow-hidden">
              <div className="grid md:grid-cols-5 gap-0">
                {/* Left: Video + Photo */}
                <div className="md:col-span-2 p-6">
                  <div className="rounded-xl overflow-hidden border border-gray-200 aspect-video relative">
                    {!isTestimonialPlaying ? (
                      <button
                        onClick={() => setIsTestimonialPlaying(true)}
                        className="absolute inset-0 w-full h-full group cursor-pointer"
                      >
                        <img
                          src={kristapsPhoto}
                          alt="Kristaps - Founder of key-digital.lv"
                          className="w-full h-full object-cover object-top"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-iskra-emerald flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                        <div className="absolute bottom-3 left-3">
                          <span className="text-white text-xs font-medium bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">Watch testimonial</span>
                        </div>
                      </button>
                    ) : (
                      <iframe
                        src="https://drive.google.com/file/d/1NNQ8gBN-64xXEvRVxQdbBiqGqRkIQz8L/preview"
                        className="w-full h-full absolute inset-0"
                        allow="autoplay"
                        allowFullScreen
                      />
                    )}
                  </div>
                </div>

                {/* Right: Content */}
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

                  {/* Result metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-card rounded-xl p-3 border border-border text-center">
                      <p className="text-xl font-bold text-iskra-emerald font-display">500</p>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider font-medium mt-0.5">Messages</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
                      <p className="text-xl font-bold text-iskra-emerald font-display">8</p>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider font-medium mt-0.5">Meetings</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
                      <p className="text-xl font-bold text-iskra-emerald font-display">2d</p>
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider font-medium mt-0.5">Timeline</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Founder Card */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="flex flex-col md:flex-row items-center gap-8 p-8 card-light">
              <div className="flex-shrink-0">
                <div className="w-36 h-36 md:w-44 md:h-44 rounded-2xl overflow-hidden border-2 border-iskra-emerald/20">
                  <img src={founderPhoto} alt="Arsenijs - ISKRA Founder" className="w-full h-full object-cover object-top" />
                </div>
              </div>
              <div className="text-center md:text-left flex-1">
                <h3 className="font-bold text-xl font-display text-gray-900 mb-1">You'll Be Speaking with Arsenijs</h3>
                <p className="text-iskra-emerald text-sm font-medium mb-3">Founder, ISKRA</p>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  Sent over 1M+ WhatsApp messages across B2B, SaaS, coaching, real estate and more. Built outreach systems that generated <span className="text-iskra-emerald font-semibold">3M+ AED</span> in pipeline. No fluff — just proven strategies.
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">1M+ Messages</span>
                  <span className="px-3 py-1.5 rounded-full bg-iskra-emerald/10 text-iskra-emerald text-xs font-medium">3M+ AED Pipeline</span>
                  <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">10+ Industries</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WhatsApp CTA */}
        <section className="py-16 px-4 bg-gray-900">
          <div className="container mx-auto max-w-2xl text-center">
            <Zap className="w-10 h-10 text-iskra-emerald mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold text-white font-display mb-3">
              Have a Question Before the Call?
            </h2>
            <p className="text-gray-400 mb-8">
              Message me directly — I usually reply within minutes.
            </p>
            <a href="https://wa.me/971568785008" target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-[#25D366] hover:bg-[#20BD5A] text-white gap-2 text-lg px-8 py-6 shadow-lg">
                <MessageCircle className="w-5 h-5" />
                Message on WhatsApp
              </Button>
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-black/5">
          <div className="container mx-auto px-4 text-center">
            <p className="text-gray-400 text-sm">© {new Date().getFullYear()} ISKRA. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </>
  );
};

export default Booked;

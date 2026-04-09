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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  return (
    <>
      <Helmet>
        <title>Call Confirmed | ISKRA</title>
        <meta name="description" content="Your call with ISKRA is confirmed. Prepare for our meeting." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="min-h-screen bg-[#f5f3ef]">
        {/* Header */}
        <header className="py-6 border-b border-black/5">
          <div className="container mx-auto px-4">
            <Link to="/" className="flex items-center gap-2 w-fit">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-iskra-emerald to-iskra-emerald/70 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-gray-900">ISKRA</span>
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

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight font-display mb-4">
              While You Wait
            </h1>
            <p className="text-gray-500 text-lg max-w-lg mx-auto">
              Watch how other businesses are generating pipeline with WhatsApp outreach.
            </p>
          </div>
        </section>

        {/* Quick Steps */}
        <section className="pb-12 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-gray-200">
                <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-iskra-emerald" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iskra-emerald mb-1">Step 1</p>
                  <p className="font-semibold text-gray-900 text-sm">Accept the Calendar Invite</p>
                  <p className="text-gray-500 text-xs mt-0.5">Check your inbox and confirm</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-gray-200">
                <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center flex-shrink-0">
                  <Play className="w-5 h-5 text-iskra-emerald ml-0.5" fill="currentColor" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-iskra-emerald mb-1">Step 2</p>
                  <p className="font-semibold text-gray-900 text-sm">Watch the Video Below</p>
                  <p className="text-gray-500 text-xs mt-0.5">So we skip the basics on the call</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Loom Video */}
        <section className="pb-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-xl bg-white">
              <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                <iframe
                  src="https://www.loom.com/embed/2658f8d61782474ab7623445c4a10924?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true"
                  frameBorder="0"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="py-12 px-4 bg-gray-900">
          <div className="container mx-auto max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-iskra-emerald font-display">{value}</p>
                  <p className="text-gray-400 text-sm mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What to Expect */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold font-display text-gray-900">What We'll Cover on the Call</h2>
              <p className="text-gray-500 mt-2">30 minutes. No fluff. Actionable plan.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {expectations.map(({ icon: Icon, title, description }) => (
                <div key={title} className="text-center p-6 rounded-2xl bg-white border border-gray-200 hover:border-iskra-emerald/40 transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-iskra-emerald/10 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7 text-iskra-emerald" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">{title}</h3>
                  <p className="text-gray-500 text-sm">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="py-16 px-4 bg-white">
          <div className="container mx-auto max-w-4xl">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* Video */}
              <div className="rounded-2xl overflow-hidden border border-gray-200">
                <div className="aspect-video relative">
                  {!isVideoPlaying ? (
                    <button
                      onClick={() => setIsVideoPlaying(true)}
                      className="absolute inset-0 w-full h-full group cursor-pointer"
                    >
                      <img
                        src={kristapsPhoto}
                        alt="Kristaps - Founder of key-digital.lv"
                        className="w-full h-full object-cover object-top"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-iskra-emerald flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                        </div>
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

              {/* Quote */}
              <div>
                <Quote className="w-10 h-10 text-iskra-emerald/30 mb-4" />
                <blockquote className="text-xl md:text-2xl font-semibold text-gray-900 leading-snug mb-6">
                  "Arsenijs helped create amazing copy that brought 8 meetings in just 2 days. Highly recommend working with him!"
                </blockquote>
                <div className="flex items-center gap-3">
                  <img src={kristapsPhoto} alt="Kristaps" className="w-12 h-12 rounded-full object-cover" />
                  <div>
                    <p className="font-semibold text-gray-900">Kristaps</p>
                    <p className="text-gray-500 text-sm">
                      Founder,{" "}
                      <a href="https://key-digital.lv" target="_blank" rel="noopener noreferrer" className="text-iskra-emerald hover:underline">
                        key-digital.lv
                      </a>
                    </p>
                  </div>
                </div>
                <div className="mt-4 px-4 py-3 rounded-xl bg-iskra-emerald/10 border border-iskra-emerald/20">
                  <p className="text-sm text-gray-700">
                    <span className="text-iskra-emerald font-semibold">Result:</span> 500 messages → 8 meetings booked in 2 days
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Founder Card */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <div className="flex flex-col md:flex-row items-center gap-8 p-8 rounded-2xl bg-white border border-gray-200">
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

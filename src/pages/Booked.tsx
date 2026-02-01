import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Sparkles, Mail, Play, Calendar, Quote, MessageCircle, Target, Users, Zap, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/hooks/useScrollReveal";
import kristapsPhoto from "@/assets/testimonials/kristaps.webp";
import founderPhoto from "@/assets/founder/arsenijs-new.png";

const Booked = () => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  return (
    <>
      <Helmet>
        <title>Call Confirmed | ISKRA</title>
        <meta 
          name="description" 
          content="Your call with ISKRA is confirmed. Watch the video before our meeting." 
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      
      <main className="min-h-screen bg-background text-foreground flex flex-col">
        {/* Header */}
        <header className="py-6 border-b border-border/50">
          <div className="container mx-auto px-4">
            <Link to="/" className="flex items-center gap-2 w-fit group">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-iskra-emerald to-iskra-emerald/70 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              </div>
              <span className="font-display text-xl font-bold tracking-tight">
                ISKRA
              </span>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 py-12 px-4">
          <div className="container mx-auto max-w-5xl">
            {/* Hero Section with animated badge */}
            <ScrollReveal>
              <div className="text-center mb-12">
                {/* Animated Success Badge */}
                <div className="flex justify-center mb-8">
                  <div className="relative">
                    {/* Outer glow ring */}
                    <div className="absolute inset-0 rounded-full bg-iskra-emerald/20 blur-xl animate-pulse" />
                    {/* Pulsing ring */}
                    <div className="absolute -inset-2 rounded-full border-2 border-iskra-emerald/30 animate-ping" style={{ animationDuration: '2s' }} />
                    {/* Badge */}
                    <div className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-iskra-emerald/20 to-iskra-emerald/10 border border-iskra-emerald/40 shadow-lg shadow-iskra-emerald/20">
                      <CheckCircle2 className="w-5 h-5 text-iskra-emerald" />
                      <span className="text-iskra-emerald font-semibold">Call Booked Successfully</span>
                    </div>
                  </div>
                </div>

                {/* Heading */}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center mb-4 leading-tight font-display">
                  Do This <span className="text-iskra-emerald">Before</span> Our Call
                </h1>
                
                <p className="text-muted-foreground text-center text-lg mb-2 max-w-xl mx-auto">
                  2 quick steps to make our meeting as productive as possible
                </p>
              </div>
            </ScrollReveal>

            {/* Animated Steps Cards */}
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              {/* Step 1 */}
              <ScrollReveal delay={100}>
                <div className="group relative">
                  {/* Glow effect on hover */}
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-iskra-emerald/50 to-iskra-emerald/30 rounded-2xl opacity-0 group-hover:opacity-100 blur transition-all duration-500" />
                  
                  <div className="relative flex items-start gap-4 p-6 rounded-2xl bg-card border border-border hover:border-iskra-emerald/50 transition-all duration-300 hover:-translate-y-1">
                    {/* Animated number */}
                    <div className="relative">
                      <div className="absolute inset-0 bg-iskra-emerald/20 rounded-xl blur-md group-hover:blur-lg transition-all duration-300" />
                      <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-iskra-emerald to-iskra-emerald-dark flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Mail className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-iskra-emerald bg-iskra-emerald/10 px-2 py-0.5 rounded-full">Step 1</span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">
                        Accept the Calendar Invite
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        Check your inbox and accept the invite — so I know you'll be there
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {/* Step 2 */}
              <ScrollReveal delay={200}>
                <div className="group relative">
                  {/* Glow effect on hover */}
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-iskra-emerald/50 to-iskra-emerald/30 rounded-2xl opacity-0 group-hover:opacity-100 blur transition-all duration-500" />
                  
                  <div className="relative flex items-start gap-4 p-6 rounded-2xl bg-card border border-border hover:border-iskra-emerald/50 transition-all duration-300 hover:-translate-y-1">
                    {/* Animated number */}
                    <div className="relative">
                      <div className="absolute inset-0 bg-iskra-emerald/20 rounded-xl blur-md group-hover:blur-lg transition-all duration-300" />
                      <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-iskra-emerald to-iskra-emerald-dark flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Play className="w-6 h-6 text-white ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-iskra-emerald bg-iskra-emerald/10 px-2 py-0.5 rounded-full">Step 2</span>
                      </div>
                      <h3 className="font-semibold text-lg mb-1">
                        Watch the Short Video
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        5 minutes to see how it works — so we can skip the basics on the call
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>

            {/* Loom Video Embed */}
            <ScrollReveal delay={300}>
              <div className="relative group mb-16">
                {/* Outer glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-iskra-emerald/30 via-iskra-emerald/10 to-iskra-emerald/30 rounded-2xl blur-lg opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative rounded-2xl overflow-hidden border border-iskra-emerald/30 shadow-2xl shadow-iskra-emerald/10">
                  <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
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
            </ScrollReveal>

            {/* What to Expect Section */}
            <ScrollReveal delay={400}>
              <div className="mb-16">
                <div className="text-center mb-8">
                  <h2 className="text-2xl md:text-3xl font-bold font-display mb-2">
                    What to Expect on the Call
                  </h2>
                  <p className="text-muted-foreground">
                    Here's what we'll cover in our 30-minute session
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    { icon: Target, title: "Your Ideal Projects", desc: "We'll define exactly what types of projects you're looking for" },
                    { icon: Users, title: "Target Districts", desc: "Which areas in Dubai work best for your business" },
                    { icon: Zap, title: "The System", desc: "How we find interested leads via WhatsApp outreach" }
                  ].map((item, index) => (
                    <div key={index} className="group text-center p-6 rounded-2xl bg-card border border-border hover:border-iskra-emerald/50 transition-all duration-300 hover:-translate-y-1">
                      <div className="relative mx-auto mb-4 w-fit">
                        <div className="absolute inset-0 bg-iskra-emerald/20 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        <div className="relative w-14 h-14 rounded-2xl bg-iskra-emerald/10 border border-iskra-emerald/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-iskra-emerald/20 transition-all duration-300">
                          <item.icon className="w-7 h-7 text-iskra-emerald" />
                        </div>
                      </div>
                      <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                      <p className="text-muted-foreground text-sm">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>

            {/* Founder Section */}
            <ScrollReveal delay={500}>
              <div className="mb-16">
                <div className="relative group">
                  {/* Outer glow */}
                  <div className="absolute -inset-1 bg-gradient-to-br from-iskra-emerald/20 to-transparent rounded-3xl blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative flex flex-col md:flex-row items-center gap-8 p-8 rounded-2xl bg-gradient-to-br from-iskra-emerald/10 to-card border border-iskra-emerald/20 hover:border-iskra-emerald/40 transition-all duration-500">
                    <div className="flex-shrink-0">
                      <div className="relative group/photo">
                        <div className="absolute -inset-2 bg-gradient-to-br from-iskra-emerald/40 to-iskra-emerald/10 rounded-2xl blur-lg opacity-50 group-hover/photo:opacity-100 transition-opacity duration-300" />
                        <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-2xl overflow-hidden border-2 border-iskra-emerald/30 shadow-lg shadow-iskra-emerald/20 hover:scale-105 transition-transform duration-300">
                          <img 
                            src={founderPhoto} 
                            alt="Arsenijs - ISKRA Founder"
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-center md:text-left flex-1">
                      <h3 className="font-bold text-xl mb-1 font-display">
                        You'll Be Speaking with Arsenijs
                      </h3>
                      <p className="text-iskra-emerald text-sm font-medium mb-3">
                        Founder, ISKRA
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                        Sent over 1M+ messages across different niches. Helped renovation companies generate over <span className="text-iskra-emerald font-semibold">3M+ AED</span> in revenue through WhatsApp outreach. No fluff — just actionable strategies.
                      </p>
                      <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                        <div className="px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground text-xs font-medium">
                          1M+ Messages Sent
                        </div>
                        <div className="px-3 py-1.5 rounded-full bg-iskra-emerald/20 border border-iskra-emerald/30 text-iskra-emerald text-xs font-medium">
                          3M+ AED Generated
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <a 
                        href="https://wa.me/971568785008" 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <Button 
                          size="lg" 
                          className="bg-[#25D366] hover:bg-[#20BD5A] text-white gap-2 hover:scale-105 transition-transform duration-300 shadow-lg shadow-[#25D366]/30"
                        >
                          <MessageCircle className="w-5 h-5" />
                          Message on WhatsApp
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Testimonial Section */}
            <ScrollReveal delay={600}>
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <p className="text-muted-foreground text-sm uppercase tracking-wider font-medium">
                    What our clients say
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 items-center">
                  {/* Video Testimonial */}
                  <div className="bg-card border border-border rounded-2xl p-4 overflow-hidden hover:border-iskra-emerald/30 transition-all duration-300 hover:-translate-y-1">
                    <div className="aspect-video rounded-xl overflow-hidden relative mb-4">
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
                          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-iskra-emerald flex items-center justify-center shadow-lg shadow-iskra-emerald/30 group-hover:scale-110 transition-transform duration-300">
                              <Play className="w-6 h-6 text-primary-foreground ml-1" fill="currentColor" />
                            </div>
                          </div>
                          <div className="absolute bottom-3 left-3">
                            <p className="text-xs text-white/80 font-medium">
                              Watch testimonial
                            </p>
                          </div>
                        </button>
                      ) : (
                        <iframe
                          src="https://drive.google.com/file/d/1NNQ8gBN-64xXEvRVxQdbBiqGqRkIQz8L/preview"
                          className="w-full h-full"
                          allow="autoplay"
                          allowFullScreen
                          title="Kristaps testimonial video"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <img 
                        src={kristapsPhoto} 
                        alt="Kristaps"
                        className="w-10 h-10 rounded-full object-cover object-top border-2 border-iskra-emerald/30"
                      />
                      <div>
                        <p className="font-semibold text-sm">Kristaps</p>
                        <p className="text-xs text-muted-foreground">
                          Founder, key-digital.lv
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quote */}
                  <div className="bg-card border border-border rounded-2xl p-6 relative hover:border-iskra-emerald/30 transition-all duration-300 hover:-translate-y-1">
                    <Quote className="absolute top-4 left-4 w-6 h-6 text-iskra-emerald/30" />
                    <div className="pl-6 pt-2">
                      <p className="text-foreground/80 text-sm leading-relaxed mb-4">
                        "Arsenijs helped create amazing copy that brought 8 meetings in just 2 days. Highly recommend working with him!"
                      </p>
                      <div className="bg-iskra-emerald/10 rounded-lg p-3 border border-iskra-emerald/20">
                        <p className="text-xs font-medium text-iskra-emerald mb-0.5">Result:</p>
                        <p className="font-display text-sm font-bold">
                          500 messages → 8 meetings in 2 days
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-6 border-t border-border/50">
          <div className="container mx-auto px-4 text-center">
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} ISKRA. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
};

export default Booked;

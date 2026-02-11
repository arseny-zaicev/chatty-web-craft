import { useState } from "react";
import { ArrowRight, MessageCircle, Quote, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import kristapsPhoto from "@/assets/testimonials/kristaps.webp";
import { ScrollReveal } from "@/hooks/useScrollReveal";

export const Testimonials = () => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Client Results
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              What Our Clients Say
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real results from businesses using our WhatsApp engine.
            </p>
          </div>
        </ScrollReveal>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Video Testimonial */}
            <ScrollReveal delay={100}>
              <div className="bg-card border border-iskra-emerald/30 rounded-2xl p-6 shadow-lg hover-lift">
                <div className="aspect-video bg-gradient-to-br from-iskra-emerald/20 to-iskra-emerald/5 rounded-xl mb-6 overflow-hidden relative">
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
                        <div className="w-20 h-20 rounded-full bg-iskra-emerald flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 group-hover:shadow-iskra-emerald/50">
                          <Play className="w-8 h-8 text-primary-foreground ml-1" fill="currentColor" />
                        </div>
                      </div>
                      <div className="absolute bottom-4 left-4 right-4">
                        <p className="text-sm text-primary-foreground/80 font-medium">
                          Watch testimonial
                        </p>
                      </div>
                    </button>
                  ) : (
                    <iframe
                      src="https://drive.google.com/file/d/1NNQ8gBN-64xXEvRVxQdbBiqGqRkIQz8L/preview"
                      className="w-full h-full relative z-10"
                      allow="autoplay"
                      allowFullScreen
                      title="Kristaps testimonial video"
                    />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img 
                      src={kristapsPhoto} 
                      alt="Kristaps"
                      className="w-12 h-12 rounded-full object-cover object-top border-2 border-iskra-emerald/30"
                    />
                    <div>
                      <p className="font-semibold text-lg">Kristaps</p>
                      <p className="text-sm text-muted-foreground">
                        Founder,{" "}
                        <a 
                          href="https://key-digital.lv" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-iskra-emerald hover:underline"
                        >
                          key-digital.lv
                        </a>
                      </p>
                    </div>
                  </div>
                  <div className="bg-iskra-emerald/10 rounded-xl p-4 border border-iskra-emerald/20">
                    <p className="text-sm font-medium text-iskra-emerald mb-1">Result:</p>
                    <p className="font-display text-lg font-bold">
                      500 messages → 8 meetings booked in 2 days
                    </p>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Quote + CTA */}
            <ScrollReveal delay={200}>
              <div className="space-y-8">
                <div className="bg-card border border-border rounded-2xl p-8 relative">
                  <Quote className="absolute top-6 left-6 w-8 h-8 text-iskra-emerald/20" />
                  <div className="pl-8 pt-4">
                    <p className="text-lg text-foreground mb-6 leading-relaxed">
                      "Arsenijs helped create amazing copy that brought 8 meetings in just 2 days. Highly recommend working with him!"
                    </p>
                    <div className="flex items-center gap-3">
                      <img 
                        src={kristapsPhoto} 
                        alt="Kristaps"
                        className="w-12 h-12 rounded-full object-cover object-top border-2 border-iskra-emerald/30"
                      />
                      <div>
                        <p className="font-semibold">Kristaps</p>
                        <p className="text-sm text-muted-foreground">Founder, key-digital.lv</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground mb-4">
                    More case studies coming soon.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
};

import { useState } from "react";
import { ArrowRight, MessageCircle, Quote, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import kristapsPhoto from "@/assets/testimonials/kristaps.webp";

export const Testimonials = () => {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  return (
    <section className="py-24 bg-iskra-cream">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            What Our Clients Say
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Real results from real businesses using our AI solutions.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Video Testimonial */}
            <div className="bg-card border border-iskra-emerald/30 rounded-2xl p-6 shadow-lg hover:shadow-iskra-emerald/20 transition-all">
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

            {/* Quote + CTA */}
            <div className="space-y-8">
              <div className="bg-card border border-border rounded-2xl p-8 relative">
                <Quote className="absolute top-6 left-6 w-8 h-8 text-iskra-emerald/20" />
                <div className="pl-8 pt-4">
                  <p className="text-lg text-foreground mb-6 leading-relaxed">
                    "We were skeptical about AI outreach, but ISKRA delivered real meetings from day one. 
                    The WhatsApp automation feels completely natural — leads don't even realize it's AI."
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
                  Want to see more real examples?
                </p>
                <Link to="/ai-agent">
                  <Button 
                    size="lg" 
                    className="bg-iskra-emerald hover:bg-iskra-emerald-dark text-primary-foreground"
                  >
                    View Real Use Cases
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
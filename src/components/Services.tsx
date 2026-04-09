import { MessageSquare, ArrowRight, Send, BarChart3, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ScrollReveal } from "@/hooks/useScrollReveal";
import { SketchUnderline } from "@/components/SketchElements";

export const Services = () => {
  return (
    <section id="chatbot" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-5">
              What We Build For You
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A complete WhatsApp outreach engine — from infrastructure to booked calls.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="max-w-4xl mx-auto">
            <div className="rounded-3xl p-8 md:p-12 bg-gradient-to-br from-iskra-emerald to-iskra-emerald-dark text-primary-foreground shadow-glow hover-scale-subtle">
              <div className="flex flex-col md:flex-row gap-8 items-start">
                <div className="flex-1">
                  <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 bg-primary-foreground/20 text-primary-foreground">
                    Full-Service • Done For You
                  </div>
                  
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-primary-foreground/20">
                    <MessageSquare className="w-8 h-8 text-primary-foreground" />
                  </div>
                  
                  <h3 className="font-display text-3xl md:text-4xl font-bold mb-4">
                    <span className="inline-block">
                      WhatsApp Booking Engine
                      <span style={{ display: 'block', marginTop: '-4px' }}>
                        <SketchUnderline color="hsl(0 0% 100% / 0.6)" delay={0.4} />
                      </span>
                    </span>
                  </h3>
                  
                  <p className="text-primary-foreground/80 text-lg mb-8 leading-relaxed">
                    Dedicated sending accounts, proven copy sequences, CRM handoff, and full funnel tracking. 
                    AI automation layer available when you're ready to scale.
                  </p>
                  
                  <div className="grid sm:grid-cols-2 gap-4 mb-8">
                    {[
                      "ICP research & positioning",
                      "Copy + follow-up sequences",
                      "Dedicated WhatsApp infrastructure",
                      "CRM handoff & tracking",
                      "10,000+ message pilots",
                      "AI layer (add-on)",
                    ].map((feature) => (
                      <div key={feature} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                        <span className="text-primary-foreground/90">{feature}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link to="/whatsapp">
                      <Button
                        size="lg"
                        className="bg-primary-foreground text-iskra-emerald-dark hover:bg-primary-foreground/90 font-semibold group"
                      >
                        See How It Works
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </div>
                
                {/* Stats column */}
                <div className="w-full md:w-auto grid grid-cols-2 md:grid-cols-1 gap-4">
                  <div className="bg-primary-foreground/10 rounded-2xl p-6 text-center">
                    <Send className="w-5 h-5 mx-auto mb-2 text-primary-foreground/70" />
                    <div className="text-4xl font-bold mb-1">98%</div>
                    <div className="text-sm text-primary-foreground/70">Delivery Rate</div>
                  </div>
                  <div className="bg-primary-foreground/10 rounded-2xl p-6 text-center">
                    <BarChart3 className="w-5 h-5 mx-auto mb-2 text-primary-foreground/70" />
                    <div className="text-4xl font-bold mb-1">8%+</div>
                    <div className="text-sm text-primary-foreground/70">Reply Rate</div>
                  </div>
                  <div className="bg-primary-foreground/10 rounded-2xl p-6 text-center">
                    <Bot className="w-5 h-5 mx-auto mb-2 text-primary-foreground/70" />
                    <div className="text-4xl font-bold mb-1">AI</div>
                    <div className="text-sm text-primary-foreground/70">Ready Add-on</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

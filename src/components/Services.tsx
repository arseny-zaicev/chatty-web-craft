import { Bot, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export const Services = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="chatbot" className="py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Your 24/7 AI Sales Agent
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Replace repetitive manual work with intelligent automation that never sleeps.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Main AI Bot Card */}
          <div className="rounded-3xl p-8 md:p-12 transition-all duration-300 bg-gradient-to-br from-iskra-emerald to-iskra-emerald-dark text-primary-foreground shadow-glow">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-1">
                <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 bg-primary-foreground/20 text-primary-foreground">
                  AI-Powered • Works 24/7
                </div>
                
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 bg-primary-foreground/20">
                  <Bot className="w-8 h-8 text-primary-foreground" />
                </div>
                
                <h3 className="font-display text-3xl md:text-4xl font-bold mb-2">
                  AI RAG Agent
                </h3>
                
                <p className="text-primary-foreground/70 text-sm mb-4">
                  RAG = Retrieval-Augmented Generation — AI that uses your real business data to answer leads accurately.
                </p>
                
                <p className="text-primary-foreground/80 text-lg mb-8 leading-relaxed">
                  Intelligent conversational AI that handles WhatsApp inquiries, qualifies leads, and books meetings through natural dialogue — all on autopilot.
                </p>
                
                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {[
                    "Leads receive WhatsApp messages instantly",
                    "Natural conversation like a real human",
                    "Books meetings through dialogue, not links",
                    "Any language configuration",
                    "Full CRM sync with statuses & updates",
                    "Custom setup based on your needs",
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      <span className="text-primary-foreground/90">{feature}</span>
                    </div>
                  ))}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    size="lg"
                    className="bg-primary-foreground text-iskra-emerald-dark hover:bg-primary-foreground/90 font-semibold group"
                    onClick={scrollToContact}
                  >
                    Get Your AI Agent
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  
                  <Link to="/ai-agent">
                    <Button
                      variant="glass"
                      size="lg"
                      className="bg-primary-foreground/10 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20 group w-full sm:w-auto"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      See Real Use Cases
                    </Button>
                  </Link>
                </div>
              </div>
              
              {/* Stats column */}
              <div className="w-full md:w-auto grid grid-cols-2 md:grid-cols-1 gap-4">
                <div className="bg-primary-foreground/10 rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold mb-1">70%</div>
                  <div className="text-sm text-primary-foreground/70">Cost Reduction</div>
                </div>
                <div className="bg-primary-foreground/10 rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold mb-1">40h+</div>
                  <div className="text-sm text-primary-foreground/70">Saved Weekly</div>
                </div>
                <div className="bg-primary-foreground/10 rounded-2xl p-6 text-center">
                  <div className="text-4xl font-bold mb-1">&lt;2m</div>
                  <div className="text-sm text-primary-foreground/70">Response Time</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

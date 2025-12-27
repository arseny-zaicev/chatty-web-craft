import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, Calendar, Bot, Database, Settings, Globe, CheckCircle, Play } from "lucide-react";

const AIAgent = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  const workflowSteps = [
    {
      icon: Database,
      title: "1. Connect Your Data",
      description: "Upload your business info, FAQ, services, pricing — the AI learns your business inside out.",
    },
    {
      icon: Globe,
      title: "2. Configure Languages & Tone",
      description: "Set up any language, customize conversation style to match your brand voice.",
    },
    {
      icon: MessageCircle,
      title: "3. Lead Receives WhatsApp",
      description: "New lead? They get a personalized WhatsApp message instantly — no delays.",
    },
    {
      icon: Bot,
      title: "4. AI Handles Conversation",
      description: "Natural dialogue, answering questions, qualifying the lead, handling objections.",
    },
    {
      icon: Calendar,
      title: "5. Meeting Booked via Dialogue",
      description: "No clunky links — the AI negotiates time and books directly through chat.",
    },
    {
      icon: Settings,
      title: "6. CRM Sync & Handoff",
      description: "All data synced to your CRM with statuses. Hot lead? Your sales rep takes over.",
    },
  ];

  return (
    <>
      <Helmet>
        <title>AI RAG Agent Use Cases | ISKRA Digital</title>
        <meta 
          name="description" 
          content="See how AI RAG Agent works in real scenarios. WhatsApp automation, lead qualification, meeting booking through natural conversation." 
        />
      </Helmet>
      
      <main className="min-h-screen">
        <Navbar />
        
        {/* Hero */}
        <section className="pt-32 pb-16 bg-gradient-to-b from-iskra-emerald/10 to-background">
          <div className="container mx-auto px-4 text-center">
            <div className="inline-block px-4 py-2 rounded-full bg-iskra-emerald/20 text-iskra-emerald text-sm font-medium mb-6">
              Real Use Cases & Workflows
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold mb-6">
              AI RAG Agent in Action
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              See exactly how our AI handles WhatsApp conversations, qualifies leads, and books meetings — with real examples.
            </p>
            <Button 
              size="lg" 
              className="bg-iskra-emerald hover:bg-iskra-emerald-dark text-primary-foreground"
              onClick={scrollToContact}
            >
              Get Your AI Agent
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </section>

        {/* Workflow Section */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                How It Works: Step by Step
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                From setup to closed deals — the complete AI RAG Agent workflow.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {workflowSteps.map((step, index) => (
                <div 
                  key={index}
                  className="bg-card border border-border rounded-2xl p-6 hover:border-iskra-emerald/50 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4">
                    <step.icon className="w-6 h-6 text-iskra-emerald" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                What Makes It Different
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {[
                {
                  title: "RAG Technology",
                  description: "Uses YOUR real business data to answer — not generic AI responses. Accurate, relevant, trustworthy.",
                },
                {
                  title: "Human-Like Dialogue",
                  description: "Natural conversation flow, handles objections, asks clarifying questions — leads think they're talking to a person.",
                },
                {
                  title: "No Link Booking",
                  description: "Books meetings through conversation: 'How about Tuesday 3pm?' — no Calendly links that kill conversions.",
                },
                {
                  title: "Full CRM Integration",
                  description: "Every message, status, qualification score synced. Your sales team sees the full picture instantly.",
                },
              ].map((feature, index) => (
                <div key={index} className="flex gap-4">
                  <CheckCircle className="w-6 h-6 text-iskra-emerald flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-display text-lg font-semibold mb-1">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                What Our Clients Say
              </h2>
              <p className="text-lg text-muted-foreground">
                Real results from real businesses using AI RAG Agent.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Testimonial 1 - Kristaps */}
              <div className="bg-card border border-border rounded-2xl p-6 hover:border-iskra-emerald/50 transition-all">
                <div className="aspect-video bg-muted rounded-xl mb-6 flex items-center justify-center overflow-hidden relative group cursor-pointer">
                  <a 
                    href="https://drive.google.com/file/d/1NNQ8gBN-64xXEvRVxQdbBiqGqRkIQz8L/view" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full h-full flex items-center justify-center bg-gradient-to-br from-iskra-emerald/20 to-iskra-emerald/5"
                  >
                    <div className="w-16 h-16 rounded-full bg-iskra-emerald flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-primary-foreground ml-1" />
                    </div>
                  </a>
                </div>
                <div>
                  <p className="font-semibold text-lg">Kristaps</p>
                  <p className="text-sm text-muted-foreground mb-2">
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
                  <p className="text-sm text-muted-foreground italic">
                    WhatsApp Outreach Product
                  </p>
                </div>
              </div>

              {/* Placeholder for more testimonials */}
              <div className="bg-card border border-dashed border-border rounded-2xl p-6 flex items-center justify-center min-h-[300px]">
                <p className="text-muted-foreground text-center">
                  More testimonials coming soon...
                </p>
              </div>

              <div className="bg-card border border-dashed border-border rounded-2xl p-6 flex items-center justify-center min-h-[300px]">
                <p className="text-muted-foreground text-center">
                  More testimonials coming soon...
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="contact" className="py-24 bg-gradient-to-br from-iskra-emerald to-iskra-emerald-dark text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Ready to Automate Your Sales?
            </h2>
            <p className="text-xl text-primary-foreground/80 max-w-2xl mx-auto mb-8">
              Get your AI RAG Agent set up in days, not months. Start converting more leads today.
            </p>
            <Button 
              size="lg" 
              className="bg-primary-foreground text-iskra-emerald-dark hover:bg-primary-foreground/90 font-semibold"
              onClick={() => window.location.href = "/#contact"}
            >
              Get Your AI Agent
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
};

export default AIAgent;

import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { QualificationForm } from "@/components/QualificationForm";
import { UrgencyBanner } from "@/components/UrgencyBanner";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, Calendar, Bot, Database, Settings, Globe, CheckCircle, Play, Building, ShoppingCart, Briefcase, Heart, X } from "lucide-react";

// Placeholder for case study images - will be replaced with real ones
const caseStudies = [
  {
    id: 1,
    industry: "Real Estate",
    icon: Building,
    title: "Property Seller Lead Qualification",
    description: "Coming soon — full workflow breakdown of how AI handles real estate seller inquiries.",
    result: "",
    workflowImages: [], // Will add real images later
  },
  {
    id: 2,
    industry: "E-commerce",
    icon: ShoppingCart,
    title: "Product Inquiry & Order Support",
    description: "Coming soon — see how AI manages customer questions and drives conversions.",
    result: "",
    workflowImages: [],
  },
  {
    id: 3,
    industry: "B2B Services",
    icon: Briefcase,
    title: "Lead Nurturing & Meeting Booking",
    description: "Coming soon — end-to-end B2B sales automation case study.",
    result: "",
    workflowImages: [],
  },
  {
    id: 4,
    industry: "Healthcare",
    icon: Heart,
    title: "Patient Appointment Scheduling",
    description: "Coming soon — AI-powered clinic booking and FAQ handling.",
    result: "",
    workflowImages: [],
  },
];

const AIAgent = () => {
  const [selectedCase, setSelectedCase] = useState<number | null>(null);

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
        <title>AI RAG Agent Use Cases | ISKRA</title>
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
            
            {/* Key Benefits */}
            <div className="flex flex-wrap justify-center gap-6 mb-10">
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle className="w-5 h-5 text-iskra-emerald" />
                <span>Responds in under 60 seconds</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle className="w-5 h-5 text-iskra-emerald" />
                <span>Works 24/7, no breaks</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle className="w-5 h-5 text-iskra-emerald" />
                <span>Books meetings via dialogue</span>
              </div>
              <div className="flex items-center gap-2 text-foreground/80">
                <CheckCircle className="w-5 h-5 text-iskra-emerald" />
                <span>Syncs with your CRM</span>
              </div>
            </div>
            
            <Button 
              size="lg" 
              className="bg-iskra-emerald hover:bg-iskra-emerald-dark text-primary-foreground"
              onClick={() => window.location.href = "/#contact"}
            >
              Get Your AI Agent
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </section>

        {/* Video Demo Section */}
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Watch It in Action
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                See a real AI RAG Agent conversation from start to meeting booked.
              </p>
            </div>

            {/* Video Placeholder */}
            <div className="max-w-4xl mx-auto">
              <div className="aspect-video bg-card border border-border rounded-2xl flex items-center justify-center relative overflow-hidden group cursor-pointer">
                <div className="absolute inset-0 bg-gradient-to-br from-iskra-emerald/10 to-iskra-emerald/5" />
                <div className="relative z-10 text-center">
                  <div className="w-20 h-20 rounded-full bg-iskra-emerald/20 border-2 border-iskra-emerald flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-iskra-emerald ml-1" />
                  </div>
                  <p className="text-muted-foreground">Video demo coming soon</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Industry Case Studies */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Case Studies by Industry
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Click on any industry to see the detailed workflow and results.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {caseStudies.map((study) => (
                <button
                  key={study.id}
                  onClick={() => setSelectedCase(selectedCase === study.id ? null : study.id)}
                  className={`bg-card border rounded-2xl p-6 text-left transition-all duration-300 hover:border-iskra-emerald/50 ${
                    selectedCase === study.id ? "border-iskra-emerald ring-2 ring-iskra-emerald/20" : "border-border"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4">
                    <study.icon className="w-6 h-6 text-iskra-emerald" />
                  </div>
                  <p className="text-xs text-iskra-emerald font-medium mb-2">{study.industry}</p>
                  <h3 className="font-display text-lg font-semibold mb-2">{study.title}</h3>
                  <p className="text-sm text-muted-foreground">{study.description}</p>
                </button>
              ))}
            </div>

            {/* Expanded Case Study View */}
            {selectedCase && (
              <div className="mt-12 max-w-4xl mx-auto">
                <div className="bg-card border border-iskra-emerald/30 rounded-2xl p-8 relative">
                  <button 
                    onClick={() => setSelectedCase(null)}
                    className="absolute top-4 right-4 p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  
                  {(() => {
                    const study = caseStudies.find(s => s.id === selectedCase);
                    if (!study) return null;
                    
                    return (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 rounded-xl bg-iskra-emerald/10 flex items-center justify-center">
                            <study.icon className="w-5 h-5 text-iskra-emerald" />
                          </div>
                          <div>
                            <p className="text-xs text-iskra-emerald font-medium">{study.industry}</p>
                            <h3 className="font-display text-xl font-semibold">{study.title}</h3>
                          </div>
                        </div>
                        
                        {/* Workflow Images Placeholder */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          {[1, 2, 3, 4].map((i) => (
                            <div 
                              key={i}
                              className="aspect-[3/4] bg-muted border border-dashed border-border rounded-xl flex items-center justify-center"
                            >
                              <p className="text-xs text-muted-foreground text-center px-2">
                                Workflow Step {i}
                              </p>
                            </div>
                          ))}
                        </div>
                        
                        <div className="bg-muted/50 rounded-xl p-6">
                          <h4 className="font-semibold mb-2">What Was Done:</h4>
                          <p className="text-muted-foreground">
                            Detailed description of the implementation, workflow setup, and results will be added here.
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Workflow Section */}
        <section className="py-24 bg-muted/30">
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
        <section className="py-24">
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
        <section className="py-24 bg-muted/30">
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
              <div className="bg-card border border-iskra-emerald/30 rounded-2xl p-6 hover:border-iskra-emerald transition-all shadow-lg hover:shadow-iskra-emerald/20">
                <div className="aspect-video bg-gradient-to-br from-iskra-emerald/20 to-iskra-emerald/5 rounded-xl mb-6 overflow-hidden relative group">
                  <iframe
                    src="https://drive.google.com/file/d/1NNQ8gBN-64xXEvRVxQdbBiqGqRkIQz8L/preview"
                    className="w-full h-full relative z-10"
                    allow="autoplay"
                    allowFullScreen
                    title="Kristaps testimonial video"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-iskra-emerald/20 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-iskra-emerald" />
                    </div>
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

        {/* Urgency Banner */}
        <UrgencyBanner type="ai-agent" />

        {/* Contact Form */}
        <QualificationForm />

        <Footer />
      </main>
    </>
  );
};

export default AIAgent;

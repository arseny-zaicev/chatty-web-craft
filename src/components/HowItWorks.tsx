import { Target, Code, Sparkles, Rocket, MessageCircle } from "lucide-react";
import { AIWorkflowAnimation } from "./AIWorkflowAnimation";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const steps = [
  {
    icon: Target,
    title: "Discovery & ROI Planning",
    description: "We deeply understand your needs and calculate exactly how our solution will generate revenue for your business. Clear goals, measurable outcomes.",
    duration: "1-2 days",
  },
  {
    icon: Code,
    title: "Development & Warmup",
    description: "We build your custom solution — AI agent, WhatsApp numbers warming up, automation workflows. Everything gets prepared in parallel for maximum speed.",
    duration: "~7 days",
    badge: "WhatsApp + AI",
  },
  {
    icon: Sparkles,
    title: "Fine-Tuning",
    description: "Minor adjustments based on real conversations. We optimize AI responses, refine targeting, and polish until everything performs perfectly.",
    duration: "2-3 weeks",
  },
  {
    icon: Rocket,
    title: "Scale & Support",
    description: "Ongoing monitoring and optimization as your business grows. We're always here to help you maximize results from your WhatsApp outreach and AI.",
    duration: "Ongoing",
  },
];

export const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              <span className="text-iskra-emerald font-semibold">Fast. Reliable. Results-Driven.</span>
              <br />
              The real process behind every WhatsApp campaign & AI agent we build.
            </p>
          </div>
        </ScrollReveal>

        {/* Animated Workflow Visualization */}
        <div className="mb-16">
          <AIWorkflowAnimation />
        </div>

        {/* Detailed Steps Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <ScrollReveal key={step.title} delay={index * 100}>
              <div
                className="glass-card rounded-2xl p-6 hover-lift hover:shadow-glow group h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4 group-hover:bg-iskra-emerald/20 icon-rotate-hover">
                  <step.icon className="w-6 h-6 text-iskra-emerald" />
                </div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs text-iskra-emerald font-semibold">
                    Step {index + 1}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-iskra-emerald/10 text-iskra-emerald font-medium">
                    {step.duration}
                  </span>
                  {step.badge && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {step.badge}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

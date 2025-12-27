import { Target, Code, Sparkles, Rocket } from "lucide-react";
import { AIWorkflowAnimation } from "./AIWorkflowAnimation";

const steps = [
  {
    icon: Target,
    title: "Discovery & ROI Planning",
    description: "We deeply understand your needs and calculate exactly how AI will generate revenue for your business. Clear goals, measurable outcomes.",
    duration: "1-2 days",
  },
  {
    icon: Code,
    title: "Development & Launch",
    description: "We build your custom AI agent and launch it live. Your agent starts working immediately — handling chats, qualifying leads, booking meetings.",
    duration: "~7 days",
  },
  {
    icon: Sparkles,
    title: "Fine-Tuning",
    description: "Minor adjustments based on real conversations. We optimize responses, add edge cases, and polish until your AI performs perfectly.",
    duration: "2-3 weeks",
  },
  {
    icon: Rocket,
    title: "Scale & Support",
    description: "Ongoing monitoring and optimization as your business grows. We're always here to help you get the most out of your AI agent.",
    duration: "Ongoing",
  },
];

export const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            <span className="text-iskra-emerald font-semibold">Fast. Reliable. Results-Driven.</span>
            <br />
            The real process behind every AI agent we build.
          </p>
        </div>

        {/* Animated Workflow Visualization */}
        <div className="mb-16">
          <AIWorkflowAnimation />
        </div>

        {/* Detailed Steps Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="glass-card rounded-2xl p-6 hover:shadow-glow transition-all duration-300 group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4 group-hover:bg-iskra-emerald/20 group-hover:scale-110 transition-all duration-300">
                <step.icon className="w-6 h-6 text-iskra-emerald group-hover:rotate-12 transition-transform duration-300" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-iskra-emerald font-semibold">
                  Step {index + 1}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-iskra-emerald/10 text-iskra-emerald font-medium">
                  {step.duration}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

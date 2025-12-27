import { Target, Code, Sparkles } from "lucide-react";

const steps = [
  {
    icon: Target,
    title: "Discovery & ROI Planning",
    description: "We deeply understand your needs and calculate exactly how AI will generate revenue for your business. Clear goals, measurable outcomes.",
    duration: "1-2 days",
  },
  {
    icon: Code,
    title: "Development Phase",
    description: "Our team builds your custom AI agent — from conversation flows to CRM integration. Fast delivery without compromising quality.",
    duration: "~7 days",
  },
  {
    icon: Sparkles,
    title: "Fine-Tuning & Training",
    description: "Active monitoring, adding small details, and continuous agent training. We optimize responses until your AI performs perfectly.",
    duration: "20-25 days",
  },
];

export const HowItWorks = () => {
  return (
    <section id="outreach" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            <span className="text-iskra-emerald font-semibold">Fast. Reliable. Results-Driven.</span>
            <br />
            The real process behind every AI agent we build.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="glass-card rounded-2xl p-8 hover:shadow-glow transition-all duration-300 group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-14 h-14 rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-6 group-hover:bg-iskra-emerald/20 group-hover:scale-110 transition-all duration-300">
                <step.icon className="w-7 h-7 text-iskra-emerald group-hover:rotate-12 transition-transform duration-300" />
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-iskra-emerald font-semibold">
                  Step {index + 1}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-iskra-emerald/10 text-iskra-emerald font-medium">
                  {step.duration}
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">
                {step.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

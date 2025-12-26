import { Settings, CheckCircle, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Settings,
    title: "7-Day Warm-Up",
    description: "We warm up all accounts before launch. Aged (5+ year) accounts warm the new ones exclusively for your campaigns.",
  },
  {
    icon: CheckCircle,
    title: "Validation & Copy Approval",
    description: "During this warm-up period, we validate all contact data on WhatsApp and finalize your message copy for approval.",
  },
  {
    icon: TrendingUp,
    title: "Continuous Flow & Analytics",
    description: "Once the campaign starts, messages flow daily. We refine your copy, monitor delivery, and send detailed daily analytics.",
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
            <span className="text-iskra-emerald font-semibold">Simple. Scalable. Secure.</span>
            <br />
            The real process behind every ISKRA campaign.
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
              <div className="text-sm text-iskra-emerald font-semibold mb-2">
                Step {index + 1}
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

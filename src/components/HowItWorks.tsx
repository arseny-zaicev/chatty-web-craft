import { useNavigate } from "react-router-dom";
import { Target, MessageSquare, BarChart3, Rocket, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/hooks/useScrollReveal";
import { SketchUnderline } from "@/components/SketchElements";

const steps = [
  {
    icon: Target,
    title: "Discovery & Strategy",
    description: "We align on your ICP, craft the right offer angle, and plan the campaign structure - warm, reactivation, or cold.",
    duration: "1-2 days",
  },
  {
    icon: MessageSquare,
    title: "Infrastructure Setup",
    description: "Dedicated WhatsApp accounts, number warmup, anti-block systems, and copy sequences - all prepared before launch.",
    duration: "~5 days",
  },
  {
    icon: BarChart3,
    title: "Launch & Optimize",
    description: "Campaigns go live. We A/B test angles, monitor replies, and fine-tune follow-up sequences for maximum positive reply rate.",
    duration: "Week 1-2",
  },
  {
    icon: Rocket,
    title: "Scale & Report",
    description: "Qualified replies flow to your CRM. Weekly reports, strategy calls, and scaling when results are proven.",
    duration: "Ongoing",
  },
];

export const HowItWorks = () => {
  const navigate = useNavigate();

  return (
    <section id="how-it-works" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="tag-green mb-4 inline-block">Our process</span>
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-5">
              How We Build Your{' '}
              <span className="inline-block">
                <span className="text-gradient">Outreach Engine</span>
                <span style={{ display: 'block', marginTop: '-4px' }}>
                  <SketchUnderline color="hsl(152 50% 36%)" delay={0.4} />
                </span>
              </span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              From strategy to scale - a proven process that delivers results in weeks, not months.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-12">
          {steps.map((step, index) => (
            <ScrollReveal key={step.title} delay={index * 100}>
              <div className="card-light rounded-2xl p-6 hover-lift h-full">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 icon-shimmer">
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-primary font-semibold">
                    Step {index + 1}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {step.duration}
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">
                  {step.title}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal>
          <div className="text-center">
            <Button
              variant="cta"
              size="lg"
              className="group"
              onClick={() => navigate("/demo")}
            >
              Book a Demo
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

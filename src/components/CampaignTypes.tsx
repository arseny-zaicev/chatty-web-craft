import { Flame, RefreshCw, Send, ArrowRight, Clock, Users, BarChart3, MessageCircle, Database, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

const campaigns = [
  {
    icon: Flame,
    tag: "Hot Leads",
    title: "Warm Traffic Processing",
    description: "Your inbound leads get a WhatsApp message within 10 minutes — automatically. We design follow-up sequences, loop in your team, and push all lead data into your CRM.",
    features: [
      { icon: Clock, text: "Auto-message within 10 min" },
      { icon: MessageCircle, text: "Smart follow-up sequences" },
      { icon: Users, text: "Team notifications & handoff" },
      { icon: BarChart3, text: "Full CRM data sync" },
    ],
  },
  {
    icon: RefreshCw,
    tag: "Database",
    title: "Base Reactivation",
    description: "Got old leads that went cold? We warm them back up through WhatsApp — new angle, new offer, back into your pipeline.",
    features: [
      { icon: Database, text: "Import your existing base" },
      { icon: MessageCircle, text: "Re-engagement sequences" },
      { icon: Target, text: "Fresh offer positioning" },
      { icon: BarChart3, text: "Track reactivated leads" },
    ],
  },
  {
    icon: Send,
    tag: "Outbound",
    title: "Cold Outreach",
    description: "Full-cycle cold WhatsApp campaigns — we build ICP-targeted lists, craft the copy, send at scale, and qualify every reply.",
    features: [
      { icon: Target, text: "ICP-targeted list building" },
      { icon: MessageCircle, text: "Proven copy & A/B testing" },
      { icon: Users, text: "Reply qualification" },
      { icon: BarChart3, text: "Pipeline reporting" },
    ],
  },
];

export const CampaignTypes = () => {
  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            Campaign Types
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4 tracking-tight">
            WhatsApp Campaigns<br />Built Around Your Needs
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Whether you need to process hot inbound leads, reactivate an old database, or launch cold outreach — we build the engine.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">
          {campaigns.map((campaign, index) => (
            <div
              key={index}
              className="group relative bg-card border border-border rounded-2xl p-7 hover:border-primary/40 transition-all duration-500 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Glow on hover */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative z-10">
                {/* Icon + Tag */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <campaign.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">
                    {campaign.tag}
                  </span>
                </div>

                {/* Title & Description */}
                <h3 className="font-display text-xl font-bold mb-3 tracking-tight">
                  {campaign.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  {campaign.description}
                </p>

                {/* Features */}
                <div className="space-y-3">
                  {campaign.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <feature.icon className="w-4 h-4 text-primary/60 flex-shrink-0" />
                      <span className="text-sm text-foreground/80">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Demo CTA */}
        <div className="text-center">
          <Button
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
            onClick={() => window.open("https://wa.me/971568785008?text=Hi!%20I%20want%20to%20see%20a%20demo", "_blank")}
          >
            Book a Demo
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            Free walkthrough — see how it works for your business
          </p>
        </div>
      </div>
    </section>
  );
};

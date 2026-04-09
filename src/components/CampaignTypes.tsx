import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, RefreshCw, Send, ArrowRight, Clock, Users, BarChart3, Target, Database, Zap, CheckCircle2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

const campaigns = [
  {
    id: "warm",
    label: "Warm Traffic",
    icon: MessageSquare,
    tagline: "Process inbound leads before they go cold",
    steps: [
      { icon: Zap, title: "Lead comes in", desc: "From ads, website, or any source" },
      { icon: Clock, title: "10-min WhatsApp reply", desc: "Automated first touch while lead is hot" },
      { icon: MessageSquare, title: "Follow-up sequence", desc: "Custom cadence until reply or booking" },
      { icon: BarChart3, title: "CRM handoff", desc: "Qualified data synced to your CRM" },
    ],
    caseStudy: {
      metric: "10 min",
      metricLabel: "first touch",
      before: "Leads go cold while your team manually follows up — many get lost or blocked",
      after: "Automated WhatsApp reply within 10 minutes, no blocks, no lost leads",
      industry: "Works across all industries",
    },
  },
  {
    id: "reactivation",
    label: "Base Reactivation",
    icon: RefreshCw,
    tagline: "Turn dead leads into live pipeline",
    steps: [
      { icon: Database, title: "Upload your base", desc: "Old leads, lost deals, inactive contacts" },
      { icon: Target, title: "Segment & repackage", desc: "Fresh offer angle for each segment" },
      { icon: Send, title: "WhatsApp outreach", desc: "Warm re-engagement + follow-ups" },
      { icon: Users, title: "Qualify replies", desc: "Filter interested → pass to sales" },
    ],
    caseStudy: {
      metric: "25%",
      metricLabel: "positive reply rate",
      before: "Thousands of dormant leads sitting untouched in CRM",
      after: "25% positive reply rate → 4% booking rate + best practices to increase show-up",
      industry: "Across multiple industries",
    },
  },
  {
    id: "cold",
    label: "Cold Outreach",
    icon: Send,
    tagline: "Full-cycle outreach to your ICP",
    steps: [
      { icon: Target, title: "ICP list building", desc: "We source contacts matching your ideal client" },
      { icon: Bot, title: "Number warmup", desc: "Dedicated accounts, anti-block infrastructure" },
      { icon: Send, title: "A/B campaigns", desc: "Test angles, copy, and sequences" },
      { icon: CheckCircle2, title: "Qualified replies", desc: "Only positive replies forwarded to you" },
    ],
    caseStudy: {
      metric: "13%",
      metricLabel: "positive reply rate",
      before: "Cold outreach to new audiences matching your ICP",
      after: "13% positive reply rate → 1% booking rate across different industries",
      industry: "Across different industries",
    },
  },
];

export const CampaignTypes = () => {
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const campaign = campaigns[active];

  return (
    <section id="campaigns" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="tag-green mb-4 inline-block">Our campaigns</span>
          <h2 className="font-display font-bold mb-4">
            Choose Your <span className="text-gradient">Outreach Type</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Every business has different needs. Pick the campaign type that fits yours.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3 mb-12 max-w-2xl mx-auto">
          {campaigns.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActive(i)}
              className={`
                flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200
                ${active === i
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "bg-card border border-border text-foreground/70 hover:border-primary/30 hover:text-foreground"
                }
              `}
            >
              <c.icon className="w-4 h-4" />
              {c.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto">
          {/* Left — Process */}
          <div className="card-light">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">How it works</p>
            <h3 className="font-display text-xl font-bold mb-6 text-foreground">{campaign.tagline}</h3>

            <div className="space-y-5">
              {campaign.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <step.icon className="w-5 h-5 text-primary" />
                    </div>
                    {i < campaign.steps.length - 1 && (
                      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-px h-5 bg-border" />
                    )}
                  </div>
                  <div className="pt-1">
                    <p className="font-semibold text-foreground text-sm">{step.title}</p>
                    <p className="text-muted-foreground text-sm">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Case Study */}
          <div className="card-light flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Real result</p>
            <p className="text-sm text-muted-foreground mb-6">{campaign.caseStudy.industry}</p>

            {/* Big metric */}
            <div className="flex items-baseline gap-3 mb-8">
              <span className="text-5xl md:text-6xl font-display font-extrabold text-primary leading-none">
                {campaign.caseStudy.metric}
              </span>
              <span className="text-lg text-foreground/70 font-medium">
                {campaign.caseStudy.metricLabel}
              </span>
            </div>

            {/* Before / After */}
            <div className="space-y-3 mb-8 flex-1">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Before</p>
                  <p className="text-foreground/80 text-sm">{campaign.caseStudy.before}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-xs uppercase tracking-wider text-primary font-semibold">After</p>
                  <p className="text-foreground/80 text-sm">{campaign.caseStudy.after}</p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Button
              variant="cta"
              size="lg"
              className="w-full group"
              onClick={() => navigate("/demo")}
            >
              Book a Demo
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

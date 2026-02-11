import { useState } from "react";
import { ClipboardCheck, Wrench, Rocket, TrendingUp, Bot, ChevronDown } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const stages = [
  {
    id: 0,
    icon: ClipboardCheck,
    label: "Stage 0",
    title: "Fit Check",
    duration: "1 call",
    summary: "We verify the channel makes sense for your business before committing.",
    details: [
      "LTV / margin / close rate analysis",
      "Capacity check — how many calls/week can your team handle",
      "SLA definition — who handles interest and how fast",
      "ICP confirmation & exclusion rules",
    ],
    outcome: "Go / No-Go decision + pilot plan + KPIs",
  },
  {
    id: 1,
    icon: Wrench,
    label: "Stage 1",
    title: "Engine Build",
    duration: "5–7 days",
    summary: "We build the full infrastructure and make your pilot launch-ready.",
    details: [
      "Offer review + unique angle messaging",
      "ICP segmentation (1–3 segments) + exclusion rules",
      "Copy library: first messages + 3–5 touch follow-up + A/B plan",
      "WhatsApp accounts creation (country-specific, dedicated to you)",
      "Profile setup, cadence rules, opt-out & health safeguards",
      "CRM handoff: stages, tags, warm lead transfer rules",
      "Tracking: sent → delivered → reply → positive → booked",
    ],
    outcome: "Everything ready to launch, everything measured",
  },
  {
    id: 2,
    icon: Rocket,
    label: "Stage 2",
    title: "Pilot Launch",
    duration: "2 weeks",
    summary: "We run the first campaign to validate and find the winning sequence.",
    details: [
      "Stabilize accounts & sending health",
      "Test 2–3 approaches by ICP / angle / messaging",
      "Get first confirmed metrics: replies, positives, bookings",
      "Find the winning sequence",
      "Minimum 10,000 messages for statistical validity",
    ],
    outcome: "Validated playbook with real numbers",
  },
  {
    id: 3,
    icon: TrendingUp,
    label: "Stage 3",
    title: "Growth",
    duration: "Monthly",
    summary: "Scale what works — more volume, more segments, better cost per booked.",
    details: [
      "Increase volume according to plan",
      "Expand segments & geographies",
      "Weekly copy / sequence / timing iterations",
      "Strengthen qualification to filter out noise",
      "Optimize KPIs and reduce cost per booked call",
    ],
    outcome: "Predictable, growing pipeline",
  },
  {
    id: 4,
    icon: Bot,
    label: "Stage 4",
    title: "Scale + AI",
    duration: "Add-on",
    summary: "AI layer automates replies, qualification, and booking — your team only handles hot leads.",
    details: [
      "Auto-reply to common questions",
      "Rule-based lead qualification",
      "CRM auto-fill: tags, notes, routing",
      "Safe mode: AI pauses on edge cases, hands off to human",
      "Setters spend time only on hot leads & calls",
    ],
    outcome: "Full automation with human safety net",
  },
];

export const WhatsAppStages = () => {
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  return (
    <section id="stages" className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              The Process
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              How We Build Your Engine
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From validation to scale — a clear path with measurable outcomes at every stage.
            </p>
          </div>
        </ScrollReveal>

        {/* Timeline */}
        <div className="max-w-3xl mx-auto space-y-4">
          {stages.map((stage, index) => {
            const isExpanded = expandedStage === stage.id;
            const Icon = stage.icon;

            return (
              <ScrollReveal key={stage.id} delay={index * 80}>
                <div className="relative group/card">
                  {/* Ambient glow */}
                  <div className={`absolute -inset-[2px] rounded-2xl pointer-events-none transition-all duration-500 ${
                    isExpanded 
                      ? "opacity-100" 
                      : "opacity-0 group-hover/card:opacity-100"
                  }`} style={{ 
                    background: "linear-gradient(135deg, hsl(155 80% 45% / 0.25), hsl(150 75% 55% / 0.1), hsl(155 80% 45% / 0.25))",
                    boxShadow: "0 0 50px 8px hsl(155 80% 45% / 0.08), 0 0 20px 2px hsl(155 80% 45% / 0.12)"
                  }} />
                  
                  <button
                    onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                    className={`relative w-full text-left glass-card rounded-2xl p-6 transition-all duration-300 ${
                      isExpanded ? "border-iskra-emerald/60" : "hover:border-iskra-emerald/30"
                    }`}
                  >
                  {/* Header row */}
                  <div className="flex items-center gap-4">
                    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0 icon-shimmer ${
                      isExpanded ? "bg-iskra-emerald text-primary-foreground" : "bg-iskra-emerald/10"
                    }`}>
                      <Icon className={`relative w-5 h-5 ${isExpanded ? "" : "text-iskra-emerald"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-iskra-emerald">{stage.label}</span>
                        <span className="text-xs text-muted-foreground">· {stage.duration}</span>
                      </div>
                      <h3 className="font-headline text-lg font-bold">{stage.title}</h3>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-300 ${
                      isExpanded ? "rotate-180" : ""
                    }`} />
                  </div>

                  {/* Summary always visible */}
                  <p className="text-sm text-muted-foreground mt-3 ml-16">{stage.summary}</p>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-6 ml-16 animate-fade-in">
                      <ul className="space-y-2 mb-4">
                        {stage.details.map((detail) => (
                          <li key={detail} className="flex items-start gap-2 text-sm text-foreground/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-iskra-emerald mt-2 shrink-0" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                      <div className="bg-iskra-emerald/10 rounded-xl p-4 border border-iskra-emerald/20">
                        <p className="text-sm font-semibold text-iskra-emerald">
                          Outcome: <span className="text-foreground/80 font-normal">{stage.outcome}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </button>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

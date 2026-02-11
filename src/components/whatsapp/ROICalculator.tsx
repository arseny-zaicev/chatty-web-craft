import { useState, useMemo } from "react";
import { Calculator, TrendingUp, MessageSquare, Phone, ArrowDown, ChevronDown } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

export const ROICalculator = () => {
  const [closeRate, setCloseRate] = useState(15);
  const [dealSize, setDealSize] = useState(5000);
  const [margin, setMargin] = useState(30);

  const results = useMemo(() => {
    // Real benchmarks from our clients
    const deliveryRate = 0.98;
    const overallReplyRate = 0.35; // 30-40% overall reply rate (incl. negative)
    const bookingRateFromMessages = 0.013; // 0.8-1.9% booking rate from messages sent (avg ~1.3%)

    const messagesPerMonth = 10000;
    const delivered = messagesPerMonth * deliveryRate;
    const totalReplies = delivered * overallReplyRate;
    const booked = messagesPerMonth * bookingRateFromMessages;
    const closed = booked * (closeRate / 100);
    const revenue = closed * dealSize;
    const profit = revenue * (margin / 100);

    return {
      messagesPerMonth,
      totalReplies: Math.round(totalReplies),
      booked: Math.round(booked),
      closed: Math.round(closed * 10) / 10,
      revenue: Math.round(revenue),
      profit: Math.round(profit),
      bookingPct: ((booked / messagesPerMonth) * 100).toFixed(1),
      replyPct: (overallReplyRate * 100).toFixed(0),
    };
  }, [closeRate, dealSize, margin]);

  return (
    <section className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              ROI Calculator
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              See Your Potential Numbers
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Input your business metrics — we'll show the projected pipeline from 10,000 monthly messages.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 relative">
              {/* Inputs */}
              <div className="glass-card rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-iskra-emerald/10 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-iskra-emerald" />
                  </div>
                  <h3 className="font-headline text-lg font-bold">Your Metrics</h3>
                </div>

                <div className="space-y-8">
                  {/* Close Rate */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-foreground/80">Close rate on qualified calls</label>
                      <span className="text-sm font-bold text-iskra-emerald">{closeRate}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={80}
                      value={closeRate}
                      onChange={(e) => setCloseRate(Number(e.target.value))}
                      className="w-full h-2 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-iskra-emerald [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>5%</span>
                      <span>80%</span>
                    </div>
                  </div>

                  {/* Deal Size */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-foreground/80">Average deal size</label>
                      <span className="text-sm font-bold text-iskra-emerald">€{dealSize.toLocaleString()}</span>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={50000}
                      step={500}
                      value={dealSize}
                      onChange={(e) => setDealSize(Number(e.target.value))}
                      className="w-full h-2 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-iskra-emerald [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>€500</span>
                      <span>€50,000</span>
                    </div>
                  </div>

                  {/* Margin */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-foreground/80">Profit margin</label>
                      <span className="text-sm font-bold text-iskra-emerald">{margin}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      value={margin}
                      onChange={(e) => setMargin(Number(e.target.value))}
                      className="w-full h-2 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-iskra-emerald [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>10%</span>
                      <span>80%</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-6">
                  Based on real client data: 98% delivery, 30–40% reply rate, 0.8–1.9% booking rate.
                </p>
              </div>

              {/* Connecting arrow between cards */}
              <div className="hidden lg:flex absolute -left-8 top-1/2 -translate-y-1/2 -translate-x-full items-center z-10">
                <svg width="64" height="24" viewBox="0 0 64 24" fill="none">
                  <defs>
                    <linearGradient id="arrow-flow" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(var(--iskra-emerald))" stopOpacity="0.2">
                        <animate attributeName="stopOpacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
                      </stop>
                      <stop offset="50%" stopColor="hsl(var(--iskra-emerald))" stopOpacity="0.8">
                        <animate attributeName="offset" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
                      </stop>
                      <stop offset="100%" stopColor="hsl(var(--iskra-emerald))" stopOpacity="0.4">
                        <animate attributeName="stopOpacity" values="0.4;0.7;0.4" dur="2s" repeatCount="indefinite" />
                      </stop>
                    </linearGradient>
                    <filter id="arrow-soft-glow">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <path d="M0 12 C16 12, 32 4, 48 12 C52 14, 48 12, 64 12" stroke="url(#arrow-flow)" strokeWidth="2" strokeLinecap="round" fill="none" filter="url(#arrow-soft-glow)" />
                  <path d="M54 6 L64 12 L54 18" stroke="url(#arrow-flow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#arrow-soft-glow)" />
                </svg>
              </div>

              {/* Results */}
              <div className="glass-card rounded-2xl p-8 border-iskra-emerald/30 relative">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-iskra-emerald/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-iskra-emerald" />
                  </div>
                  <h3 className="font-headline text-lg font-bold">Projected Monthly Results</h3>
                </div>

                {/* Funnel visualization */}
                <div className="space-y-3 mb-8">
                  {[
                    { label: "Messages Sent", value: results.messagesPerMonth.toLocaleString(), sub: "", width: "100%" },
                    { label: "Total Replies", value: results.totalReplies.toLocaleString(), sub: `~${results.replyPct}% reply rate`, width: "65%" },
                    { label: "Booked Calls", value: results.booked.toLocaleString(), sub: `~${results.bookingPct}% booking rate`, width: "20%" },
                  ].map(({ label, value, sub, width }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground/70">{label}</span>
                        <div className="text-right">
                          <span className="font-semibold">{value}</span>
                          {sub && <span className="text-xs text-muted-foreground ml-2">{sub}</span>}
                        </div>
                      </div>
                      <div className="h-2 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-iskra-emerald to-iskra-emerald-light rounded-full transition-all duration-700"
                          style={{ width }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Revenue highlight */}
                <div className="bg-iskra-emerald/10 rounded-xl p-6 border border-iskra-emerald/20 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Projected Monthly Profit</p>
                  <p className="text-4xl font-bold text-iskra-emerald font-headline">
                    €{results.profit.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    ~{results.closed} closed deals × €{dealSize.toLocaleString()} × {margin}% margin
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

import { useState, useMemo } from "react";
import { Calculator, TrendingUp, MessageSquare, Phone } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

export const ROICalculator = () => {
  const [closeRate, setCloseRate] = useState(15);
  const [dealSize, setDealSize] = useState(5000);
  const [margin, setMargin] = useState(30);

  const results = useMemo(() => {
    // Industry benchmarks for WhatsApp outreach
    const deliveryRate = 0.98;
    const replyRate = 0.08; // 8% reply rate average
    const positiveRate = 0.35; // 35% of replies are positive
    const bookingRate = 0.5; // 50% of positives book

    const messagesPerMonth = 10000;
    const delivered = messagesPerMonth * deliveryRate;
    const replies = delivered * replyRate;
    const positives = replies * positiveRate;
    const booked = positives * bookingRate;
    const closed = booked * (closeRate / 100);
    const revenue = closed * dealSize;
    const profit = revenue * (margin / 100);

    return {
      messagesPerMonth,
      replies: Math.round(replies),
      positives: Math.round(positives),
      booked: Math.round(booked),
      closed: Math.round(closed * 10) / 10,
      revenue: Math.round(revenue),
      profit: Math.round(profit),
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
            <div className="grid lg:grid-cols-2 gap-8">
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
                      max={50}
                      value={closeRate}
                      onChange={(e) => setCloseRate(Number(e.target.value))}
                      className="w-full h-2 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-iskra-emerald [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>5%</span>
                      <span>50%</span>
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
                  Based on industry averages: 98% delivery, 8% reply rate, 35% positive intent, 50% booking rate.
                </p>
              </div>

              {/* Results */}
              <div className="glass-card rounded-2xl p-8 border-iskra-emerald/30">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-iskra-emerald/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-iskra-emerald" />
                  </div>
                  <h3 className="font-headline text-lg font-bold">Projected Monthly Results</h3>
                </div>

                {/* Funnel visualization */}
                <div className="space-y-3 mb-8">
                  {[
                    { label: "Messages Sent", value: results.messagesPerMonth.toLocaleString(), icon: MessageSquare, width: "100%" },
                    { label: "Replies", value: results.replies.toLocaleString(), icon: MessageSquare, width: "70%" },
                    { label: "Positive Interest", value: results.positives.toLocaleString(), icon: MessageSquare, width: "45%" },
                    { label: "Booked Calls", value: results.booked.toLocaleString(), icon: Phone, width: "25%" },
                  ].map(({ label, value, width }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground/70">{label}</span>
                        <span className="font-semibold">{value}</span>
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

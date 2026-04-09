import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";
import { useNavigate } from "react-router-dom";

export const ROICalculator = () => {
  const navigate = useNavigate();
  const [closeRate, setCloseRate] = useState(15);
  const [dealSize, setDealSize] = useState(5000);

  const results = useMemo(() => {
    const messagesPerMonth = 10000;
    const bookingRate = 0.013;
    const booked = Math.round(messagesPerMonth * bookingRate);
    const closed = Math.floor(booked * (closeRate / 100));
    const revenue = closed * dealSize;

    return { booked, closed, revenue };
  }, [closeRate, dealSize]);

  const sliderClass =
    "w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 " +
    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-iskra-emerald [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer";

  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
                Estimate
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                What Could This <span className="text-gradient">Mean for You</span>
              </h2>
              <p className="text-muted-foreground">
                Based on 10,000 monthly messages. Adjust your metrics below.
              </p>
            </div>

            {/* Sliders */}
            <div className="space-y-8 mb-12">
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-foreground/70">Close rate</span>
                  <span className="text-sm font-semibold text-iskra-emerald">{closeRate}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={closeRate}
                  onChange={(e) => setCloseRate(Number(e.target.value))}
                  className={sliderClass}
                />
              </div>

              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-foreground/70">Average deal size</span>
                  <span className="text-sm font-semibold text-iskra-emerald">€{dealSize.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={50000}
                  step={500}
                  value={dealSize}
                  onChange={(e) => setDealSize(Number(e.target.value))}
                  className={sliderClass}
                />
              </div>
            </div>

            {/* Results — 3 numbers */}
            <div className="grid grid-cols-3 gap-6 mb-10">
              {[
                { label: "Booked calls", value: results.booked },
                { label: "Closed deals", value: results.closed },
                { label: "Revenue", value: `€${results.revenue.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold font-display text-foreground">{value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center mb-8">
              Projections based on real client benchmarks: ~1.3% booking rate from messages sent.
            </p>

            <div className="text-center">
              <button
                onClick={() => navigate("/demo")}
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-iskra-emerald text-background font-semibold shadow-[0_0_20px_rgba(0,224,150,0.3)] hover:shadow-[0_0_30px_rgba(0,224,150,0.5)] transition-all duration-300"
              >
                See What We Can Do for You
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

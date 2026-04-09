import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";
import { useNavigate } from "react-router-dom";

const BOOKING_OPTIONS = [1, 2, 3, 4];

export const ROICalculator = () => {
  const navigate = useNavigate();
  const [bookingRate, setBookingRate] = useState(2);
  const [closeRate, setCloseRate] = useState(30);
  const [showUpRate, setShowUpRate] = useState(70);
  const [dealSize, setDealSize] = useState(5000);

  const results = useMemo(() => {
    const messagesPerMonth = 10000;
    const booked = Math.round(messagesPerMonth * (bookingRate / 100));
    const showed = Math.round(booked * (showUpRate / 100));
    const closed = Math.floor(showed * (closeRate / 100));
    const revenue = closed * dealSize;

    return { booked, showed, closed, revenue };
  }, [bookingRate, closeRate, showUpRate, dealSize]);

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

            {/* Booking Rate Selector */}
            <div className="mb-8">
              <p className="text-sm text-foreground/70 mb-3">Booking rate from messages</p>
              <div className="flex gap-3">
                {BOOKING_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setBookingRate(rate)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      bookingRate === rate
                        ? "bg-iskra-emerald text-background shadow-md"
                        : "bg-muted/50 text-foreground/60 hover:bg-muted"
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-8 mb-12">
              <div>
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-foreground/70">Show-up rate</span>
                  <span className="text-sm font-semibold text-iskra-emerald">{showUpRate}%</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={95}
                  value={showUpRate}
                  onChange={(e) => setShowUpRate(Number(e.target.value))}
                  className={sliderClass}
                />
              </div>

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

            {/* Results */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: "Booked calls", value: results.booked },
                { label: "Showed up", value: results.showed },
                { label: "Closed deals", value: results.closed },
                { label: "Revenue", value: `€${results.revenue.toLocaleString()}` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-2xl md:text-3xl font-bold font-display text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>

            <div className="bg-muted/30 border border-border/50 rounded-xl p-4 mb-8">
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                ⚠️ Results vary by industry, contact quality, and campaign type. These projections are based on aggregate client benchmarks and are not a guarantee of specific outcomes.
              </p>
            </div>

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

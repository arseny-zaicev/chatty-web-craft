import { useCountUp } from "@/hooks/useCountUp";
import { Database, RefreshCw, MapPin, CheckCircle } from "lucide-react";

const stats = [
  {
    icon: Database,
    value: 220,
    suffix: "K+",
    label: "Property Owners in Database",
  },
  {
    icon: RefreshCw,
    value: 4,
    suffix: "x",
    label: "Updates Per Year",
  },
  {
    icon: MapPin,
    value: 50,
    suffix: "+",
    label: "Dubai Districts Covered",
  },
  {
    icon: CheckCircle,
    value: 85,
    suffix: "%",
    label: "Contact Accuracy",
  },
];

const StatCard = ({ icon: Icon, value, suffix, label }: typeof stats[0]) => {
  const { formattedValue, elementRef } = useCountUp({
    end: value,
    duration: 2500,
    suffix,
  });

  return (
    <div
      ref={elementRef}
      className="glass-card rounded-2xl p-6 md:p-8 text-center group hover:border-iskra-emerald/30 transition-all duration-300"
    >
      <div className="w-12 h-12 mx-auto rounded-xl bg-iskra-emerald/10 flex items-center justify-center mb-4 group-hover:bg-iskra-emerald/20 group-hover:scale-110 transition-all duration-300">
        <Icon className="w-6 h-6 text-iskra-emerald" />
      </div>
      <div className="text-3xl md:text-4xl font-bold text-iskra-emerald mb-2">
        {formattedValue}
      </div>
      <div className="text-sm text-foreground/60 font-medium">{label}</div>
    </div>
  );
};

export const SellerLeadsStats = () => {
  return (
    <section className="py-20 border-y border-border/30">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 max-w-5xl mx-auto">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
};
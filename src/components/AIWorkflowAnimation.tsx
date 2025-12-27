import { Target, Code, Sparkles, Rocket } from "lucide-react";

const stages = [
  { icon: Target, label: "Discovery", sublabel: "1-2 days" },
  { icon: Code, label: "Development", sublabel: "~7 days" },
  { icon: Sparkles, label: "Fine-Tuning", sublabel: "2-3 weeks" },
  { icon: Rocket, label: "Scale", sublabel: "Ongoing" },
];

export const AIWorkflowAnimation = () => {
  return (
    <div className="relative py-12">
      {/* Connection lines container */}
      <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 hidden md:block">
        <div className="max-w-4xl mx-auto px-8 h-full relative">
          {/* Base line */}
          <div className="absolute inset-x-0 top-0 h-full bg-iskra-emerald/20 rounded-full" />
          
          {/* Animated flowing current */}
          <div className="absolute inset-x-0 top-0 h-full overflow-hidden rounded-full">
            <div className="absolute h-full w-32 bg-gradient-to-r from-transparent via-iskra-emerald/60 to-transparent animate-flow" />
            <div className="absolute h-full w-32 bg-gradient-to-r from-transparent via-iskra-emerald/60 to-transparent animate-flow" style={{ animationDelay: "1s" }} />
            <div className="absolute h-full w-32 bg-gradient-to-r from-transparent via-iskra-emerald/60 to-transparent animate-flow" style={{ animationDelay: "2s" }} />
          </div>
        </div>
      </div>

      {/* Nodes */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4 relative z-10">
          {stages.map((stage, index) => (
            <div
              key={stage.label}
              className="flex flex-col items-center group"
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              {/* Node circle */}
              <div className="relative mb-4">
                {/* Outer glow ring */}
                <div 
                  className="absolute -inset-3 rounded-full bg-iskra-emerald/20 animate-pulse-slow opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ animationDelay: `${index * 0.2}s` }}
                />
                
                {/* Main node */}
                <div 
                  className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-card border-2 border-iskra-emerald/30 flex items-center justify-center shadow-lg group-hover:border-iskra-emerald/60 group-hover:shadow-iskra-emerald/20 transition-all duration-500 animate-node-pulse"
                  style={{ animationDelay: `${index * 0.3}s` }}
                >
                  <stage.icon className="w-7 h-7 md:w-8 md:h-8 text-iskra-emerald group-hover:scale-110 transition-transform duration-300" />
                  
                  {/* Active indicator dot */}
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-iskra-emerald animate-ping opacity-75" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-iskra-emerald" />
                </div>
              </div>

              {/* Label */}
              <div className="text-center">
                <p className="font-semibold text-foreground text-sm md:text-base mb-1">
                  {stage.label}
                </p>
                <p className="text-xs text-iskra-emerald font-medium">
                  {stage.sublabel}
                </p>
              </div>

              {/* Mobile connector arrow (only between items) */}
              {index < stages.length - 1 && (
                <div className="md:hidden absolute right-0 top-1/2 -translate-y-1/2 w-6 h-0.5 bg-iskra-emerald/30">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-t-2 border-iskra-emerald/30 rotate-45 -translate-x-1" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Decorative particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-iskra-emerald rounded-full animate-float-particle"
            style={{
              left: `${15 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + i * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
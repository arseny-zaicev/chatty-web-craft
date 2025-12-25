import { useEffect, useState } from "react";

export const LiveCounter = () => {
  const [count, setCount] = useState(10263);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    
    const interval = setInterval(() => {
      setCount((prev) => prev + Math.floor(Math.random() * 3) + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className={`glass-card rounded-2xl p-6 backdrop-blur-xl border border-iskra-emerald/20 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="text-sm text-muted-foreground mb-2">
        Messages sent · 98% delivery
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl md:text-5xl font-display font-bold text-foreground counter-animate">
          {count.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-3 text-sm">
        <div className="w-2 h-2 rounded-full bg-iskra-emerald animate-pulse" />
        <span className="text-muted-foreground">Powered by ISKRA SYSTEM</span>
      </div>
    </div>
  );
};

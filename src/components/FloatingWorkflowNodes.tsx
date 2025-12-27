import { useEffect, useState } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Mail, Globe, Send } from "lucide-react";

const nodes = [
  { icon: Bot, label: "AI Agent", color: "bg-iskra-emerald", delay: 0 },
  { icon: MessageCircle, label: "WhatsApp", color: "bg-green-500", delay: 0.5 },
  { icon: Calendar, label: "Book Meeting", color: "bg-blue-500", delay: 1 },
  { icon: Database, label: "CRM Sync", color: "bg-purple-500", delay: 1.5 },
  { icon: Zap, label: "Trigger", color: "bg-orange-500", delay: 2 },
  { icon: Mail, label: "Email", color: "bg-red-400", delay: 2.5 },
  { icon: Globe, label: "Webhook", color: "bg-cyan-500", delay: 3 },
  { icon: Send, label: "Notify", color: "bg-pink-500", delay: 3.5 },
];

const positions = [
  { top: "5%", left: "10%" },
  { top: "15%", right: "15%" },
  { top: "35%", left: "5%" },
  { top: "45%", right: "8%" },
  { top: "60%", left: "12%" },
  { top: "70%", right: "20%" },
  { top: "85%", left: "8%" },
  { top: "80%", right: "5%" },
];

interface FloatingNodeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  delay: number;
  position: { top?: string; left?: string; right?: string; bottom?: string };
}

const FloatingNode = ({ icon: Icon, label, color, delay, position }: FloatingNodeProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`absolute transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
      style={{
        ...position,
        animationDelay: `${delay}s`,
      }}
    >
      <div className="relative group">
        {/* Connection line hint */}
        <div className="absolute -right-8 top-1/2 w-8 h-px bg-gradient-to-r from-border to-transparent opacity-50" />
        <div className="absolute -left-8 top-1/2 w-8 h-px bg-gradient-to-l from-border to-transparent opacity-50" />
        
        {/* Node */}
        <div 
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/80 backdrop-blur-sm border border-border/50 shadow-lg hover:border-iskra-emerald/40 transition-all duration-300 hover:scale-105 animate-float-node cursor-default"
          style={{ animationDelay: `${delay * 0.5}s` }}
        >
          <div className={`w-7 h-7 rounded-md ${color} flex items-center justify-center shadow-md`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-medium text-foreground/80 whitespace-nowrap">{label}</span>
        </div>
        
        {/* Glow effect on hover */}
        <div className={`absolute inset-0 rounded-lg ${color} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300`} />
      </div>
    </div>
  );
};

// Connection lines between nodes
const ConnectionLines = () => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" style={{ zIndex: -1 }}>
    <defs>
      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
        <stop offset="50%" stopColor="currentColor" stopOpacity="0.5" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
      </linearGradient>
    </defs>
    {/* Animated flowing lines */}
    <path
      d="M 50 100 Q 150 50 250 150 T 450 100"
      stroke="url(#lineGradient)"
      strokeWidth="1"
      fill="none"
      className="text-iskra-emerald animate-dash"
    />
    <path
      d="M 100 300 Q 200 250 300 350 T 500 300"
      stroke="url(#lineGradient)"
      strokeWidth="1"
      fill="none"
      className="text-iskra-emerald animate-dash"
      style={{ animationDelay: "1s" }}
    />
  </svg>
);

export const FloatingWorkflowNodes = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
      <ConnectionLines />
      {nodes.map((node, index) => (
        <FloatingNode
          key={node.label}
          {...node}
          position={positions[index]}
        />
      ))}
    </div>
  );
};

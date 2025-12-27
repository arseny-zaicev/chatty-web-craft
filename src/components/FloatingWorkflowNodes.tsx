import { useEffect, useState, useRef } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send } from "lucide-react";

const nodes = [
  { id: 1, icon: Bot, label: "AI Agent", color: "#10b981" },
  { id: 2, icon: MessageCircle, label: "WhatsApp", color: "#22c55e" },
  { id: 3, icon: Calendar, label: "Meeting", color: "#3b82f6" },
  { id: 4, icon: Database, label: "CRM", color: "#a855f7" },
  { id: 5, icon: Zap, label: "Trigger", color: "#f97316" },
  { id: 6, icon: Send, label: "Notify", color: "#ec4899" },
];

// Positions for nodes (percentages)
const nodePositions = [
  { x: 8, y: 15 },
  { x: 5, y: 45 },
  { x: 10, y: 75 },
  { x: 88, y: 20 },
  { x: 90, y: 50 },
  { x: 85, y: 80 },
];

// Define connections between nodes (by index)
const connections = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5],
  [0, 3],
  [2, 5],
];

interface FloatingNodeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  delay: number;
  x: number;
  y: number;
  floatOffset: number;
}

const FloatingNode = ({ icon: Icon, label, color, delay, x, y, floatOffset }: FloatingNodeProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`absolute transition-all duration-1000 ease-out ${
        isVisible ? "opacity-70 scale-100" : "opacity-0 scale-90"
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%)`,
        animation: isVisible ? `smoothFloat ${8 + floatOffset}s ease-in-out infinite` : 'none',
        animationDelay: `${floatOffset}s`,
      }}
    >
      <div className="relative group">
        {/* Node */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/60 backdrop-blur-md border border-border/30 shadow-xl transition-all duration-500 hover:opacity-100 hover:border-iskra-emerald/50">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-xs font-medium text-foreground/70 whitespace-nowrap hidden sm:block">{label}</span>
        </div>
      </div>
    </div>
  );
};

// Animated connection lines with flowing current
const ConnectionLines = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <svg 
      ref={svgRef}
      className="absolute inset-0 w-full h-full pointer-events-none" 
      style={{ zIndex: -1 }}
      preserveAspectRatio="none"
    >
      <defs>
        {/* Gradient for the base line */}
        <linearGradient id="lineBase" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
        </linearGradient>
        
        {/* Animated gradient for flowing current */}
        <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0">
            <animate attributeName="offset" values="-0.3;1" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="0.1" stopColor="#10b981" stopOpacity="0.8">
            <animate attributeName="offset" values="-0.2;1.1" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="0.2" stopColor="#10b981" stopOpacity="0">
            <animate attributeName="offset" values="-0.1;1.2" dur="3s" repeatCount="indefinite" />
          </stop>
        </linearGradient>

        {/* Glow filter */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Draw connections */}
      {connections.map(([from, to], index) => {
        const fromPos = nodePositions[from];
        const toPos = nodePositions[to];
        
        // Calculate control points for curved line
        const midX = (fromPos.x + toPos.x) / 2;
        const midY = (fromPos.y + toPos.y) / 2;
        const curveOffset = (index % 2 === 0 ? 1 : -1) * 10;
        
        const pathD = `M ${fromPos.x}% ${fromPos.y}% Q ${midX + curveOffset}% ${midY}% ${toPos.x}% ${toPos.y}%`;

        return (
          <g key={`${from}-${to}`}>
            {/* Base line */}
            <path
              d={pathD}
              stroke="url(#lineBase)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
            {/* Flowing current */}
            <path
              d={pathD}
              stroke="url(#flowGradient)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              filter="url(#glow)"
              style={{ 
                animationDelay: `${index * 0.5}s`,
              }}
            />
          </g>
        );
      })}
    </svg>
  );
};

export const FloatingWorkflowNodes = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
      <ConnectionLines />
      {nodes.map((node, index) => (
        <FloatingNode
          key={node.id}
          icon={node.icon}
          label={node.label}
          color={node.color}
          delay={index * 0.3}
          x={nodePositions[index].x}
          y={nodePositions[index].y}
          floatOffset={index * 0.8}
        />
      ))}
    </div>
  );
};

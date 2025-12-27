import { useEffect, useState } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send, Mail, Globe, Webhook, FileText } from "lucide-react";

// Grid-based workflow nodes like n8n
const nodes = [
  // Row 1
  { id: 0, icon: Webhook, label: "Webhook", color: "#f97316", x: 12, y: 12 },
  { id: 1, icon: MessageCircle, label: "WhatsApp", color: "#22c55e", x: 32, y: 12 },
  { id: 2, icon: Bot, label: "AI Agent", color: "#10b981", x: 52, y: 12 },
  { id: 3, icon: Database, label: "CRM", color: "#a855f7", x: 72, y: 12 },
  // Row 2
  { id: 4, icon: Zap, label: "Trigger", color: "#eab308", x: 22, y: 42 },
  { id: 5, icon: Globe, label: "API", color: "#3b82f6", x: 42, y: 42 },
  { id: 6, icon: Mail, label: "Email", color: "#ec4899", x: 62, y: 42 },
  // Row 3
  { id: 7, icon: FileText, label: "Data", color: "#06b6d4", x: 17, y: 72 },
  { id: 8, icon: Calendar, label: "Calendar", color: "#8b5cf6", x: 37, y: 72 },
  { id: 9, icon: Send, label: "Notify", color: "#14b8a6", x: 57, y: 72 },
];

// Connections between nodes (flow pattern)
const connections: [number, number][] = [
  [0, 1], [1, 2], [2, 3], // Row 1 horizontal
  [1, 4], [2, 5], [3, 6], // Vertical down
  [4, 5], [5, 6],         // Row 2 horizontal
  [4, 7], [5, 8], [6, 9], // Vertical down
  [7, 8], [8, 9],         // Row 3 horizontal
];

const WorkflowNode = ({ 
  icon: Icon, 
  label, 
  color,
  x, 
  y, 
  delay 
}: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  x: number;
  y: number;
  delay: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [glowIntensity, setGlowIntensity] = useState(0.4);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 100);
    return () => clearTimeout(timer);
  }, [delay]);

  // Pulsing glow effect
  useEffect(() => {
    if (!isVisible) return;
    
    let animationId: number;
    let time = delay * 500;
    
    const animate = () => {
      time += 16;
      const glow = 0.4 + Math.sin(time / 1500) * 0.3;
      setGlowIntensity(glow);
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isVisible, delay]);

  return (
    <div
      className={`absolute transition-all duration-700 ${
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="relative">
        {/* Glow effect */}
        <div 
          className="absolute -inset-3 rounded-2xl blur-xl"
          style={{ backgroundColor: color, opacity: glowIntensity }}
        />
        
        {/* Node card */}
        <div className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card/95 backdrop-blur-sm border border-border/80 shadow-2xl">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{label}</span>
        </div>
      </div>
    </div>
  );
};

const AnimatedConnections = () => {
  const [, setTick] = useState(0);
  
  // Force re-render for smooth animations
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        {/* Glowing line gradient */}
        <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
        </linearGradient>
        
        {/* Strong glow filter */}
        <filter id="strongGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.8" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Particle glow */}
        <filter id="particleGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="1" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="blur"/>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {connections.map(([fromIdx, toIdx], index) => {
        const from = nodes[fromIdx];
        const to = nodes[toIdx];
        
        // Calculate path with right-angle connectors (n8n style)
        const isHorizontal = Math.abs(from.y - to.y) < 5;
        const isVertical = Math.abs(from.x - to.x) < 5;
        
        let pathD: string;
        
        if (isHorizontal) {
          pathD = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        } else if (isVertical) {
          pathD = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
        } else {
          // Right angle connection
          const midY = (from.y + to.y) / 2;
          pathD = `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
        }

        return (
          <g key={`conn-${fromIdx}-${toIdx}`}>
            {/* Base line - visible */}
            <path
              d={pathD}
              stroke="#10b981"
              strokeWidth="0.4"
              strokeOpacity="0.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Glowing animated line */}
            <path
              d={pathD}
              stroke="#10b981"
              strokeWidth="0.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 4"
              filter="url(#strongGlow)"
            >
              <animate
                attributeName="stroke-dashoffset"
                values="0;-16"
                dur={`${1.5 + (index % 3) * 0.5}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.6;1;0.6"
                dur={`${1 + (index % 2) * 0.5}s`}
                repeatCount="indefinite"
              />
            </path>
            
            {/* Bright traveling particle */}
            <circle r="0.8" fill="#10b981" filter="url(#particleGlow)">
              <animateMotion
                dur={`${2.5 + index % 2}s`}
                repeatCount="indefinite"
                path={pathD}
              />
              <animate
                attributeName="r"
                values="0.6;1;0.6"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
            
            {/* Second particle offset */}
            <circle r="0.5" fill="#22c55e" filter="url(#particleGlow)">
              <animateMotion
                dur={`${2.5 + index % 2}s`}
                repeatCount="indefinite"
                path={pathD}
                begin={`${1 + index * 0.1}s`}
              />
            </circle>
          </g>
        );
      })}
    </svg>
  );
};

export const FloatingWorkflowNodes = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {/* Animated connection lines */}
      <AnimatedConnections />
      
      {/* Workflow nodes */}
      {nodes.map((node, index) => (
        <WorkflowNode
          key={node.id}
          icon={node.icon}
          label={node.label}
          color={node.color}
          x={node.x}
          y={node.y}
          delay={index}
        />
      ))}
    </div>
  );
};

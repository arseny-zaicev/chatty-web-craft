import { useEffect, useState } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send, Mail, Globe, Webhook, FileText } from "lucide-react";

// Grid-based workflow nodes like n8n
const nodes = [
  // Row 1
  { id: 0, icon: Webhook, label: "Webhook", x: 15, y: 15 },
  { id: 1, icon: MessageCircle, label: "WhatsApp", x: 35, y: 15 },
  { id: 2, icon: Bot, label: "AI Agent", x: 55, y: 15 },
  { id: 3, icon: Database, label: "CRM", x: 75, y: 15 },
  // Row 2
  { id: 4, icon: Zap, label: "Trigger", x: 25, y: 45 },
  { id: 5, icon: Globe, label: "API", x: 45, y: 45 },
  { id: 6, icon: Mail, label: "Email", x: 65, y: 45 },
  // Row 3
  { id: 7, icon: FileText, label: "Data", x: 20, y: 75 },
  { id: 8, icon: Calendar, label: "Calendar", x: 40, y: 75 },
  { id: 9, icon: Send, label: "Notify", x: 60, y: 75 },
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
  x, 
  y, 
  delay 
}: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  x: number;
  y: number;
  delay: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [glowIntensity, setGlowIntensity] = useState(0.3);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 150);
    return () => clearTimeout(timer);
  }, [delay]);

  // Pulsing glow effect
  useEffect(() => {
    if (!isVisible) return;
    
    let animationId: number;
    let time = delay * 500;
    
    const animate = () => {
      time += 16;
      const glow = 0.2 + Math.sin(time / 2000) * 0.15;
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
          className="absolute inset-0 rounded-lg blur-lg bg-iskra-emerald"
          style={{ opacity: glowIntensity }}
        />
        
        {/* Node card */}
        <div className="relative flex items-center gap-2 px-2.5 py-2 rounded-lg bg-card/80 backdrop-blur-sm border border-iskra-emerald/30 shadow-lg">
          <div className="w-7 h-7 rounded-md bg-iskra-emerald/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-iskra-emerald" />
          </div>
          <span className="text-xs font-medium text-foreground/70 whitespace-nowrap">{label}</span>
        </div>
      </div>
    </div>
  );
};

const AnimatedConnections = () => {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        {/* Base line gradient */}
        <linearGradient id="baseLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
        </linearGradient>
        
        {/* Flowing pulse gradient */}
        <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0">
            <animate attributeName="offset" values="-0.3;1" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="10%" stopColor="#10b981" stopOpacity="0.8">
            <animate attributeName="offset" values="-0.2;1.1" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="20%" stopColor="#10b981" stopOpacity="0">
            <animate attributeName="offset" values="-0.1;1.2" dur="3s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
        
        {/* Glow filter */}
        <filter id="connectionGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.3" result="blur"/>
          <feMerge>
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
            {/* Base line */}
            <path
              d={pathD}
              stroke="#10b981"
              strokeWidth="0.15"
              strokeOpacity="0.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Animated flowing current */}
            <path
              d={pathD}
              stroke="#10b981"
              strokeWidth="0.3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 8"
              filter="url(#connectionGlow)"
            >
              <animate
                attributeName="stroke-dashoffset"
                values="0;-10"
                dur={`${2 + (index % 3)}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.3;0.8;0.3"
                dur={`${1.5 + (index % 2)}s`}
                repeatCount="indefinite"
              />
            </path>
            
            {/* Traveling dot */}
            <circle r="0.4" fill="#10b981" filter="url(#connectionGlow)">
              <animateMotion
                dur={`${3 + index % 2}s`}
                repeatCount="indefinite"
                path={pathD}
              />
              <animate
                attributeName="opacity"
                values="0.5;1;0.5"
                dur="1s"
                repeatCount="indefinite"
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
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1] opacity-60">
      {/* Animated connection lines */}
      <AnimatedConnections />
      
      {/* Workflow nodes */}
      {nodes.map((node, index) => (
        <WorkflowNode
          key={node.id}
          icon={node.icon}
          label={node.label}
          x={node.x}
          y={node.y}
          delay={index}
        />
      ))}
    </div>
  );
};

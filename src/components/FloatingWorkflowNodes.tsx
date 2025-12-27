import { useEffect, useState } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send } from "lucide-react";

const nodes = [
  // Left side
  { id: 0, icon: MessageCircle, label: "WhatsApp", color: "#22c55e", x: 3, y: 25 },
  { id: 1, icon: Bot, label: "AI Agent", color: "#10b981", x: 4, y: 50 },
  { id: 2, icon: Calendar, label: "Meeting", color: "#3b82f6", x: 3, y: 75 },
  // Right side
  { id: 3, icon: Zap, label: "Trigger", color: "#f97316", x: 88, y: 20 },
  { id: 4, icon: Database, label: "CRM", color: "#a855f7", x: 89, y: 50 },
  { id: 5, icon: Send, label: "Notify", color: "#ec4899", x: 88, y: 80 },
];

// Connections: WhatsApp -> AI Agent -> Meeting, Trigger -> CRM -> Notify
const connections: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5],
];

interface FloatingNodeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  baseX: number;
  baseY: number;
  delay: number;
}

const FloatingNode = ({ icon: Icon, label, color, baseX, baseY, delay }: FloatingNodeProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: baseX, y: baseY });

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 400);
    return () => clearTimeout(timer);
  }, [delay]);

  // Slow drifting movement
  useEffect(() => {
    if (!isVisible) return;
    
    let animationId: number;
    let time = delay * 1000;
    
    const animate = () => {
      time += 16;
      const offsetX = Math.sin(time / 4000) * 2;
      const offsetY = Math.cos(time / 3500) * 3;
      
      setPosition({
        x: baseX + offsetX,
        y: baseY + offsetY,
      });
      
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isVisible, baseX, baseY, delay]);

  return (
    <div
      className={`absolute transition-opacity duration-1000 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="relative group">
        {/* Glow behind node */}
        <div 
          className="absolute inset-0 rounded-xl blur-xl opacity-40"
          style={{ backgroundColor: color }}
        />
        
        {/* Node card */}
        <div className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card/90 backdrop-blur-md border border-border/50 shadow-2xl hover:border-iskra-emerald/60 transition-all duration-300">
          <div 
            className="w-9 h-9 rounded-lg flex items-center justify-center shadow-lg"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-semibold text-foreground/90 whitespace-nowrap pr-1">{label}</span>
        </div>
      </div>
    </div>
  );
};

export const FloatingWorkflowNodes = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.1" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {connections.map(([fromIdx, toIdx], index) => {
          const from = nodes[fromIdx];
          const to = nodes[toIdx];
          
          const x1 = from.x + 4;
          const y1 = from.y;
          const x2 = to.x + 4;
          const y2 = to.y;

          return (
            <g key={`line-${fromIdx}-${toIdx}`}>
              {/* Base line */}
              <line
                x1={x1} y1={y1}
                x2={x2} y2={y2}
                stroke="url(#lineGradient)"
                strokeWidth="0.3"
              />
              {/* Animated flowing dot */}
              <circle r="0.6" fill="#10b981" filter="url(#glow)">
                <animate
                  attributeName="cx"
                  values={`${x1};${x2};${x1}`}
                  dur={`${4 + index}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  values={`${y1};${y2};${y1}`}
                  dur={`${4 + index}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </svg>
      
      {/* Nodes */}
      {nodes.map((node, index) => (
        <FloatingNode
          key={node.id}
          icon={node.icon}
          label={node.label}
          color={node.color}
          baseX={node.x}
          baseY={node.y}
          delay={index}
        />
      ))}
    </div>
  );
};

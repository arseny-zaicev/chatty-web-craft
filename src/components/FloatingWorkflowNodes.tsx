import { useEffect, useState } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send } from "lucide-react";

const nodes = [
  // Left side - outside content area
  { id: 0, icon: MessageCircle, label: "WhatsApp", color: "#22c55e", x: -2, y: 20 },
  { id: 1, icon: Bot, label: "AI Agent", color: "#10b981", x: -3, y: 45 },
  { id: 2, icon: Calendar, label: "Meeting", color: "#3b82f6", x: -2, y: 70 },
  // Right side - outside content area  
  { id: 3, icon: Zap, label: "Trigger", color: "#f97316", x: 92, y: 8 },
  { id: 4, icon: Database, label: "CRM", color: "#a855f7", x: 94, y: 35 },
  { id: 5, icon: Send, label: "Notify", color: "#ec4899", x: 92, y: 88 },
];

// Connections: WhatsApp -> AI Agent -> Meeting, Trigger -> CRM -> Notify
const connections: [number, number][] = [
  [0, 1], // WhatsApp -> AI Agent
  [1, 2], // AI Agent -> Meeting
  [3, 4], // Trigger -> CRM
  [4, 5], // CRM -> Notify
];

interface FloatingNodeProps {
  id: number;
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
      time += 16; // ~60fps
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
      <div className="relative group pointer-events-auto">
        {/* Glow behind node */}
        <div 
          className="absolute inset-0 rounded-xl blur-xl opacity-30"
          style={{ backgroundColor: color }}
        />
        
        {/* Node */}
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

// Animated connection lines with flowing current
const ConnectionLines = () => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let animationId: number;
    
    const animate = () => {
      setOffset(prev => (prev + 0.5) % 100);
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
      preserveAspectRatio="none"
    >
      <defs>
        {/* Flowing gradient */}
        <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
          <stop offset="40%" stopColor="#10b981" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#10b981" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        
        {/* Glow filter */}
        <filter id="lineGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Draw connections */}
      {connections.map(([fromIdx, toIdx], index) => {
        const from = nodes[fromIdx];
        const to = nodes[toIdx];
        
        // Use viewBox percentages
        const x1 = from.x + 5;
        const y1 = from.y;
        const x2 = to.x + 5;
        const y2 = to.y;
        
        // Control point for curve
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        const pathD = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
        
        // Animated dash offset
        const dashOffset = (offset + index * 25) % 100;

        return (
          <g key={`${fromIdx}-${toIdx}`}>
            {/* Base line */}
            <path
              d={pathD}
              stroke="#10b981"
              strokeWidth="2"
              fill="none"
              strokeOpacity="0.15"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Flowing current */}
            <path
              d={pathD}
              stroke="url(#flowGrad)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="8 16"
              strokeDashoffset={-dashOffset}
              filter="url(#lineGlow)"
              vectorEffect="non-scaling-stroke"
            />
            {/* Bright flowing dot */}
            <circle r="3" fill="#10b981" filter="url(#lineGlow)">
              <animateMotion
                dur={`${3 + index}s`}
                repeatCount="indefinite"
                path={pathD}
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
    <div className="absolute inset-0 overflow-hidden z-[2]">
      {/* SVG with viewBox for percentage-based coordinates */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="flowGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <filter id="glow2" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Connection lines */}
        {connections.map(([fromIdx, toIdx], index) => {
          const from = nodes[fromIdx];
          const to = nodes[toIdx];
          
          const x1 = from.x + 5;
          const y1 = from.y;
          const x2 = to.x + 5;
          const y2 = to.y;

          return (
            <g key={`line-${fromIdx}-${toIdx}`}>
              {/* Base line */}
              <line
                x1={x1} y1={y1}
                x2={x2} y2={y2}
                stroke="#10b981"
                strokeWidth="0.3"
                strokeOpacity="0.2"
              />
              {/* Animated flowing dot */}
              <circle r="0.8" fill="#10b981" filter="url(#glow2)">
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
          id={node.id}
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

import { useEffect, useState } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send, Mail, Globe, Smartphone } from "lucide-react";

// Scattered across the hero as subtle background pattern
const nodes = [
  { id: 0, icon: MessageCircle, label: "WhatsApp", color: "#22c55e", x: 8, y: 15 },
  { id: 1, icon: Bot, label: "AI Agent", color: "#10b981", x: 85, y: 25 },
  { id: 2, icon: Calendar, label: "Calendar", color: "#3b82f6", x: 15, y: 75 },
  { id: 3, icon: Zap, label: "Trigger", color: "#f97316", x: 75, y: 12 },
  { id: 4, icon: Database, label: "CRM", color: "#a855f7", x: 90, y: 65 },
  { id: 5, icon: Send, label: "Notify", color: "#ec4899", x: 5, y: 45 },
  { id: 6, icon: Mail, label: "Email", color: "#06b6d4", x: 70, y: 80 },
  { id: 7, icon: Globe, label: "API", color: "#8b5cf6", x: 25, y: 35 },
  { id: 8, icon: Smartphone, label: "SMS", color: "#14b8a6", x: 55, y: 55 },
];

interface FloatingNodeProps {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  baseX: number;
  baseY: number;
  delay: number;
}

const FloatingNode = ({ icon: Icon, color, baseX, baseY, delay }: FloatingNodeProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: baseX, y: baseY });

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 300);
    return () => clearTimeout(timer);
  }, [delay]);

  // Very slow, gentle drifting
  useEffect(() => {
    if (!isVisible) return;
    
    let animationId: number;
    let time = delay * 2000;
    
    const animate = () => {
      time += 16;
      const offsetX = Math.sin(time / 8000) * 1.5;
      const offsetY = Math.cos(time / 7000) * 1.5;
      
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
      className={`absolute transition-all duration-1000 ${
        isVisible ? "opacity-30" : "opacity-0"
      }`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Simple icon only - minimal and subtle */}
      <div 
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ 
          backgroundColor: color,
          boxShadow: `0 0 30px ${color}40`,
        }}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
};

export const FloatingWorkflowNodes = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {/* Subtle connecting lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="subtleLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.03" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        
        {/* Very subtle grid-like connections */}
        <line x1="8" y1="15" x2="25" y2="35" stroke="url(#subtleLineGrad)" strokeWidth="0.15" />
        <line x1="25" y1="35" x2="55" y2="55" stroke="url(#subtleLineGrad)" strokeWidth="0.15" />
        <line x1="55" y1="55" x2="85" y2="25" stroke="url(#subtleLineGrad)" strokeWidth="0.15" />
        <line x1="85" y1="25" x2="75" y2="12" stroke="url(#subtleLineGrad)" strokeWidth="0.15" />
        <line x1="5" y1="45" x2="15" y2="75" stroke="url(#subtleLineGrad)" strokeWidth="0.15" />
        <line x1="90" y1="65" x2="70" y2="80" stroke="url(#subtleLineGrad)" strokeWidth="0.15" />
      </svg>
      
      {/* Nodes */}
      {nodes.map((node, index) => (
        <FloatingNode
          key={node.id}
          icon={node.icon}
          color={node.color}
          baseX={node.x}
          baseY={node.y}
          delay={index}
        />
      ))}
    </div>
  );
};

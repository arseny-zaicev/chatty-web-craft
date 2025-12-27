import { useEffect, useState, useRef, useCallback } from "react";
import { Bot, MessageCircle, Calendar, Database, Zap, Send, Mail, Globe, Webhook, FileText } from "lucide-react";

const nodeTypes = [
  { icon: Webhook, label: "Webhook", color: "#f97316" },
  { icon: MessageCircle, label: "WhatsApp", color: "#22c55e" },
  { icon: Bot, label: "AI Agent", color: "#10b981" },
  { icon: Database, label: "CRM", color: "#a855f7" },
  { icon: Zap, label: "Trigger", color: "#eab308" },
  { icon: Globe, label: "API", color: "#3b82f6" },
  { icon: Mail, label: "Email", color: "#ec4899" },
  { icon: Calendar, label: "Calendar", color: "#8b5cf6" },
  { icon: FileText, label: "Data", color: "#06b6d4" },
  { icon: Send, label: "Notify", color: "#14b8a6" },
];

interface ActiveNode {
  id: number;
  typeIndex: number;
  baseX: number;
  baseY: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  spawnTime: number;
  lifetime: number;
  opacity: number;
}

const MAX_NODES = 8;
const SPAWN_INTERVAL = 2000;
const MIN_LIFETIME = 8000;
const MAX_LIFETIME = 15000;

export const FloatingWorkflowNodes = () => {
  const [nodes, setNodes] = useState<ActiveNode[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeIdRef = useRef(0);
  const animationRef = useRef<number>();

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Spawn new nodes
  const spawnNode = useCallback(() => {
    const newNode: ActiveNode = {
      id: nodeIdRef.current++,
      typeIndex: Math.floor(Math.random() * nodeTypes.length),
      baseX: 20 + Math.random() * 60, // 20-80% of width
      baseY: 15 + Math.random() * 70, // 15-85% of height
      orbitAngle: Math.random() * Math.PI * 2,
      orbitRadius: 2 + Math.random() * 4,
      orbitSpeed: 0.0003 + Math.random() * 0.0004,
      spawnTime: Date.now(),
      lifetime: MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME),
      opacity: 0,
    };
    
    setNodes(prev => {
      if (prev.length >= MAX_NODES) {
        return [...prev.slice(1), newNode];
      }
      return [...prev, newNode];
    });
  }, []);

  // Spawn interval
  useEffect(() => {
    // Initial spawn
    for (let i = 0; i < 5; i++) {
      setTimeout(() => spawnNode(), i * 400);
    }

    const interval = setInterval(spawnNode, SPAWN_INTERVAL);
    return () => clearInterval(interval);
  }, [spawnNode]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      
      setNodes(prev => prev
        .map(node => {
          const age = now - node.spawnTime;
          const lifeProgress = age / node.lifetime;
          
          // Fade in (first 10%), full opacity (middle), fade out (last 20%)
          let opacity = 1;
          if (lifeProgress < 0.1) {
            opacity = lifeProgress / 0.1;
          } else if (lifeProgress > 0.8) {
            opacity = (1 - lifeProgress) / 0.2;
          }
          
          return {
            ...node,
            orbitAngle: node.orbitAngle + node.orbitSpeed * 16,
            opacity: Math.max(0, Math.min(1, opacity)),
          };
        })
        .filter(node => (now - node.spawnTime) < node.lifetime)
      );
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Calculate node position with parallax + orbit
  const getNodePosition = (node: ActiveNode) => {
    // Orbit movement
    const orbitX = Math.cos(node.orbitAngle) * node.orbitRadius;
    const orbitY = Math.sin(node.orbitAngle) * node.orbitRadius;
    
    // Parallax based on mouse (subtle effect)
    const parallaxStrength = 3;
    const parallaxX = (mousePos.x - 0.5) * parallaxStrength * (node.baseX / 50);
    const parallaxY = (mousePos.y - 0.5) * parallaxStrength * (node.baseY / 50);
    
    return {
      x: node.baseX + orbitX + parallaxX,
      y: node.baseY + orbitY + parallaxY,
    };
  };

  // Find connections between nearby nodes
  const getConnections = () => {
    const connections: { from: ActiveNode; to: ActiveNode; distance: number }[] = [];
    const maxDistance = 35;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pos1 = getNodePosition(nodes[i]);
        const pos2 = getNodePosition(nodes[j]);
        const distance = Math.sqrt(
          Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2)
        );
        
        if (distance < maxDistance) {
          connections.push({ from: nodes[i], to: nodes[j], distance });
        }
      }
    }
    
    return connections;
  };

  const connections = getConnections();

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none z-[1]"
    >
      {/* Connection lines with flowing current */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <filter id="connectionGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="0.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {connections.map(({ from, to, distance }, index) => {
          const pos1 = getNodePosition(from);
          const pos2 = getNodePosition(to);
          const opacity = Math.min(from.opacity, to.opacity) * (1 - distance / 35);
          
          return (
            <g key={`${from.id}-${to.id}`}>
              {/* Base line */}
              <line
                x1={pos1.x}
                y1={pos1.y}
                x2={pos2.x}
                y2={pos2.y}
                stroke="#10b981"
                strokeWidth="0.3"
                strokeOpacity={opacity * 0.5}
              />
              
              {/* Animated flowing line */}
              <line
                x1={pos1.x}
                y1={pos1.y}
                x2={pos2.x}
                y2={pos2.y}
                stroke="#22c55e"
                strokeWidth="0.5"
                strokeOpacity={opacity}
                strokeDasharray="2 3"
                filter="url(#connectionGlow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  values="0;-10"
                  dur={`${1.5 + index * 0.2}s`}
                  repeatCount="indefinite"
                />
              </line>
              
              {/* Traveling particle */}
              <circle
                r="0.6"
                fill="#10b981"
                opacity={opacity}
                filter="url(#connectionGlow)"
              >
                <animate
                  attributeName="cx"
                  values={`${pos1.x};${pos2.x};${pos1.x}`}
                  dur={`${2 + index * 0.3}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  values={`${pos1.y};${pos2.y};${pos1.y}`}
                  dur={`${2 + index * 0.3}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {nodes.map(node => {
        const nodeType = nodeTypes[node.typeIndex];
        const Icon = nodeType.icon;
        const pos = getNodePosition(node);
        
        return (
          <div
            key={node.id}
            className="absolute transition-opacity duration-300"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              opacity: node.opacity,
            }}
          >
            <div className="relative">
              {/* Glow */}
              <div 
                className="absolute -inset-3 rounded-2xl blur-xl"
                style={{ 
                  backgroundColor: nodeType.color, 
                  opacity: 0.4 + Math.sin(node.orbitAngle * 2) * 0.2 
                }}
              />
              
              {/* Card */}
              <div 
                className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl backdrop-blur-sm border shadow-2xl"
                style={{ 
                  backgroundColor: 'rgba(20, 30, 25, 0.9)',
                  borderColor: `${nodeType.color}50`,
                }}
              >
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: nodeType.color }}
                >
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-white whitespace-nowrap">
                  {nodeType.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

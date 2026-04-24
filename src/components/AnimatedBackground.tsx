import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

interface NetworkNode {
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
  size: number;
  connections: number[];
}

interface FloatingIcon {
  x: number;
  y: number;
  z: number;
  type: "chat" | "phone" | "message" | "bot" | "wifi";
  size: number;
  speed: number;
  angle: number;
  orbitRadius: number;
}

export const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const nodesRef = useRef<NetworkNode[]>([]);
  const iconsRef = useRef<FloatingIcon[]>([]);
  const rotationRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Skip heavy animation on small screens or reduced motion
    const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isSmallScreen || reducedMotion) {
      // Render a static gradient only
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const draw = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, "hsl(45, 35%, 95%)");
        g.addColorStop(0.5, "hsl(140, 35%, 70%)");
        g.addColorStop(1, "hsl(155, 55%, 30%)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };
      draw();
      window.addEventListener("resize", draw);
      return () => window.removeEventListener("resize", draw);
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Globe settings
    let globeCenterX = 0;
    let globeCenterY = 0;
    let globeRadius = 0;
    let isVisible = true;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Position globe on the right side
      globeCenterX = canvas.width * 0.65;
      globeCenterY = canvas.height * 0.5;
      globeRadius = Math.min(canvas.width, canvas.height) * 0.35;
      
      initParticles();
      initNetworkNodes();
      initFloatingIcons();
    };

    const initParticles = () => {
      particlesRef.current = [];
      const particleCount = Math.floor((canvas.width * canvas.height) / 20000);
      
      for (let i = 0; i < particleCount; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.002 + 0.001,
          twinkleOffset: Math.random() * Math.PI * 2,
        });
      }
    };

    const initNetworkNodes = () => {
      nodesRef.current = [];
      const nodeCount = 80;
      
      // Create nodes distributed on sphere surface
      for (let i = 0; i < nodeCount; i++) {
        // Use fibonacci sphere distribution for even spacing
        const phi = Math.acos(1 - 2 * (i + 0.5) / nodeCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.sin(phi) * Math.sin(theta);
        const z = Math.cos(phi);
        
        nodesRef.current.push({
          x,
          y,
          z,
          screenX: 0,
          screenY: 0,
          size: Math.random() * 3 + 2,
          connections: [],
        });
      }
      
      // Create connections between nearby nodes
      nodesRef.current.forEach((node, i) => {
        nodesRef.current.forEach((otherNode, j) => {
          if (i !== j) {
            const dist = Math.sqrt(
              Math.pow(node.x - otherNode.x, 2) +
              Math.pow(node.y - otherNode.y, 2) +
              Math.pow(node.z - otherNode.z, 2)
            );
            if (dist < 0.6 && node.connections.length < 4) {
              node.connections.push(j);
            }
          }
        });
      });
    };

    const initFloatingIcons = () => {
      const iconTypes: FloatingIcon["type"][] = ["chat", "phone", "message", "bot", "wifi"];
      iconsRef.current = [];
      
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        iconsRef.current.push({
          x: Math.cos(angle),
          y: Math.sin(angle) * 0.3,
          z: Math.sin(angle),
          type: iconTypes[i % iconTypes.length],
          size: 20 + Math.random() * 10,
          speed: 0.0003 + Math.random() * 0.0002,
          angle: angle,
          orbitRadius: globeRadius * (1.1 + Math.random() * 0.3),
        });
      }
    };

    const drawIcon = (x: number, y: number, type: FloatingIcon["type"], size: number, opacity: number) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = `hsla(155, 60%, 45%, ${opacity})`;
      ctx.fillStyle = `hsla(155, 50%, 40%, ${opacity * 0.3})`;
      ctx.lineWidth = 1.5;
      
      const s = size;
      
      switch (type) {
        case "chat":
          // Chat bubble
          ctx.beginPath();
          ctx.roundRect(x - s/2, y - s/2, s, s * 0.75, s * 0.15);
          ctx.fill();
          ctx.stroke();
          // Tail
          ctx.beginPath();
          ctx.moveTo(x - s * 0.15, y + s * 0.25);
          ctx.lineTo(x - s * 0.3, y + s * 0.5);
          ctx.lineTo(x + s * 0.1, y + s * 0.25);
          ctx.fill();
          ctx.stroke();
          // Dots
          ctx.fillStyle = `hsla(155, 60%, 45%, ${opacity})`;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x - s * 0.2 + i * s * 0.2, y - s * 0.1, s * 0.06, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
          
        case "phone":
          // Phone icon
          ctx.beginPath();
          ctx.roundRect(x - s * 0.25, y - s * 0.4, s * 0.5, s * 0.8, s * 0.08);
          ctx.fill();
          ctx.stroke();
          // Screen
          ctx.strokeRect(x - s * 0.18, y - s * 0.3, s * 0.36, s * 0.5);
          break;
          
        case "message":
          // Envelope
          ctx.beginPath();
          ctx.rect(x - s * 0.4, y - s * 0.25, s * 0.8, s * 0.5);
          ctx.fill();
          ctx.stroke();
          // Flap
          ctx.beginPath();
          ctx.moveTo(x - s * 0.4, y - s * 0.25);
          ctx.lineTo(x, y + s * 0.1);
          ctx.lineTo(x + s * 0.4, y - s * 0.25);
          ctx.stroke();
          break;
          
        case "bot":
          // Robot head
          ctx.beginPath();
          ctx.roundRect(x - s * 0.35, y - s * 0.3, s * 0.7, s * 0.6, s * 0.1);
          ctx.fill();
          ctx.stroke();
          // Eyes
          ctx.fillStyle = `hsla(155, 60%, 45%, ${opacity})`;
          ctx.beginPath();
          ctx.arc(x - s * 0.15, y - s * 0.05, s * 0.08, 0, Math.PI * 2);
          ctx.arc(x + s * 0.15, y - s * 0.05, s * 0.08, 0, Math.PI * 2);
          ctx.fill();
          // Antenna
          ctx.beginPath();
          ctx.moveTo(x, y - s * 0.3);
          ctx.lineTo(x, y - s * 0.45);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y - s * 0.48, s * 0.06, 0, Math.PI * 2);
          ctx.fill();
          break;
          
        case "wifi":
          // Wifi signal
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(x, y + s * 0.2, s * (0.15 + i * 0.15), -Math.PI * 0.8, -Math.PI * 0.2);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(x, y + s * 0.2, s * 0.05, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      ctx.restore();
    };

    const projectPoint = (x: number, y: number, z: number, rotation: number) => {
      // Rotate around Y axis
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const rotatedX = x * cosR - z * sinR;
      const rotatedZ = x * sinR + z * cosR;
      
      // Simple perspective projection
      const scale = 1 / (1 + rotatedZ * 0.3);
      
      return {
        screenX: globeCenterX + rotatedX * globeRadius * scale,
        screenY: globeCenterY + y * globeRadius * scale,
        z: rotatedZ,
        scale,
      };
    };

    const animate = (time: number) => {
      // Gradient background - more vibrant green
      const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bgGradient.addColorStop(0, "hsl(45, 35%, 95%)");
      bgGradient.addColorStop(0.3, "hsl(50, 30%, 88%)");
      bgGradient.addColorStop(0.5, "hsl(140, 35%, 70%)");
      bgGradient.addColorStop(0.75, "hsl(150, 45%, 45%)");
      bgGradient.addColorStop(1, "hsl(155, 55%, 30%)");
      
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw sparkle particles
      particlesRef.current.forEach((particle) => {
        const twinkle = Math.sin(time * particle.twinkleSpeed + particle.twinkleOffset) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * twinkle, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(50, 50%, 95%, ${particle.opacity * twinkle})`;
        ctx.fill();
      });

      // Update rotation
      rotationRef.current += 0.002;
      const rotation = rotationRef.current;

      // Draw globe glow
      const glowGradient = ctx.createRadialGradient(
        globeCenterX, globeCenterY, 0,
        globeCenterX, globeCenterY, globeRadius * 1.8
      );
      glowGradient.addColorStop(0, "hsla(150, 50%, 50%, 0.15)");
      glowGradient.addColorStop(0.4, "hsla(155, 45%, 40%, 0.08)");
      glowGradient.addColorStop(1, "hsla(155, 40%, 35%, 0)");
      
      ctx.beginPath();
      ctx.arc(globeCenterX, globeCenterY, globeRadius * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Draw globe sphere (subtle)
      const sphereGradient = ctx.createRadialGradient(
        globeCenterX - globeRadius * 0.3, 
        globeCenterY - globeRadius * 0.3, 
        0,
        globeCenterX, 
        globeCenterY, 
        globeRadius
      );
      sphereGradient.addColorStop(0, "hsla(150, 40%, 55%, 0.15)");
      sphereGradient.addColorStop(0.5, "hsla(155, 45%, 45%, 0.1)");
      sphereGradient.addColorStop(1, "hsla(160, 50%, 35%, 0.05)");
      
      ctx.beginPath();
      ctx.arc(globeCenterX, globeCenterY, globeRadius, 0, Math.PI * 2);
      ctx.fillStyle = sphereGradient;
      ctx.fill();

      // Update and sort nodes by z-depth
      nodesRef.current.forEach((node) => {
        const projected = projectPoint(node.x, node.y, node.z, rotation);
        node.screenX = projected.screenX;
        node.screenY = projected.screenY;
      });

      // Draw connections (back to front)
      const sortedNodeIndices = nodesRef.current
        .map((node, i) => ({ node, i }))
        .sort((a, b) => {
          const aZ = a.node.x * Math.sin(rotation) + a.node.z * Math.cos(rotation);
          const bZ = b.node.x * Math.sin(rotation) + b.node.z * Math.cos(rotation);
          return aZ - bZ;
        });

      // Draw connections
      ctx.strokeStyle = "hsla(150, 50%, 55%, 0.3)";
      ctx.lineWidth = 0.5;
      
      sortedNodeIndices.forEach(({ node, i }) => {
        const nodeZ = node.x * Math.sin(rotation) + node.z * Math.cos(rotation);
        if (nodeZ < 0.1) { // Only draw connections for visible side
          node.connections.forEach((connectionIdx) => {
            const otherNode = nodesRef.current[connectionIdx];
            const otherZ = otherNode.x * Math.sin(rotation) + otherNode.z * Math.cos(rotation);
            
            if (otherZ < 0.1) {
              const opacity = Math.max(0, 0.4 - (nodeZ + otherZ) * 0.3);
              ctx.strokeStyle = `hsla(150, 55%, 55%, ${opacity})`;
              ctx.beginPath();
              ctx.moveTo(node.screenX, node.screenY);
              ctx.lineTo(otherNode.screenX, otherNode.screenY);
              ctx.stroke();
            }
          });
        }
      });

      // Draw nodes
      sortedNodeIndices.forEach(({ node }) => {
        const nodeZ = node.x * Math.sin(rotation) + node.z * Math.cos(rotation);
        if (nodeZ < 0.2) {
          const opacity = Math.max(0, 0.8 - nodeZ * 0.5);
          const size = node.size * (1 - nodeZ * 0.3);
          
          // Node glow
          const nodeGlow = ctx.createRadialGradient(
            node.screenX, node.screenY, 0,
            node.screenX, node.screenY, size * 3
          );
          nodeGlow.addColorStop(0, `hsla(150, 60%, 55%, ${opacity * 0.5})`);
          nodeGlow.addColorStop(1, "hsla(150, 60%, 55%, 0)");
          
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, size * 3, 0, Math.PI * 2);
          ctx.fillStyle = nodeGlow;
          ctx.fill();
          
          // Node point
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, size, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(150, 60%, 60%, ${opacity})`;
          ctx.fill();
        }
      });

      // Draw floating icons
      iconsRef.current.forEach((icon) => {
        icon.angle += icon.speed;
        
        const iconX = Math.cos(icon.angle) * 1.3;
        const iconZ = Math.sin(icon.angle) * 1.3;
        const iconY = icon.y + Math.sin(time * 0.001 + icon.angle) * 0.1;
        
        const projected = projectPoint(iconX, iconY, iconZ, rotation);
        const iconZDepth = iconX * Math.sin(rotation) + iconZ * Math.cos(rotation);
        
        if (iconZDepth < 0.3) {
          const opacity = Math.max(0, 0.8 - iconZDepth * 0.5);
          drawIcon(
            projected.screenX,
            projected.screenY,
            icon.type,
            icon.size * projected.scale,
            opacity
          );
        }
      });

      // Add subtle horizon glow at bottom
      const horizonGlow = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
      horizonGlow.addColorStop(0, "hsla(150, 50%, 45%, 0)");
      horizonGlow.addColorStop(1, "hsla(155, 55%, 35%, 0.1)");
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);

      animationRef.current = requestAnimationFrame(animate);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-0"
      style={{ pointerEvents: "none" }}
    />
  );
};

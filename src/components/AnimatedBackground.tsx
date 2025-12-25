import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  hue: number;
}

interface Planet {
  x: number;
  y: number;
  radius: number;
  speed: number;
  angle: number;
  orbitRadius: number;
  hue: number;
  glowIntensity: number;
}

export const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const planetsRef = useRef<Planet[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
      initPlanets();
    };

    const initParticles = () => {
      particlesRef.current = [];
      const particleCount = Math.floor((canvas.width * canvas.height) / 15000);
      
      for (let i = 0; i < particleCount; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 0.5,
          speedX: (Math.random() - 0.5) * 0.3,
          speedY: (Math.random() - 0.5) * 0.3,
          opacity: Math.random() * 0.5 + 0.2,
          hue: 155 + Math.random() * 15,
        });
      }
    };

    const initPlanets = () => {
      planetsRef.current = [
        {
          x: canvas.width * 0.75,
          y: canvas.height * 0.4,
          radius: Math.min(canvas.width, canvas.height) * 0.18,
          speed: 0.0003,
          angle: 0,
          orbitRadius: 0,
          hue: 160,
          glowIntensity: 0.4,
        },
        {
          x: canvas.width * 0.2,
          y: canvas.height * 0.7,
          radius: Math.min(canvas.width, canvas.height) * 0.06,
          speed: 0.0008,
          angle: Math.PI,
          orbitRadius: 50,
          hue: 155,
          glowIntensity: 0.3,
        },
        {
          x: canvas.width * 0.85,
          y: canvas.height * 0.8,
          radius: Math.min(canvas.width, canvas.height) * 0.04,
          speed: 0.001,
          angle: Math.PI / 2,
          orbitRadius: 30,
          hue: 165,
          glowIntensity: 0.25,
        },
      ];
    };

    const drawPlanet = (planet: Planet, time: number) => {
      const wobbleX = Math.sin(time * 0.001 + planet.angle) * planet.orbitRadius;
      const wobbleY = Math.cos(time * 0.0015 + planet.angle) * planet.orbitRadius * 0.5;
      
      const x = planet.x + wobbleX;
      const y = planet.y + wobbleY;

      // Outer glow
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, planet.radius * 2.5);
      glowGradient.addColorStop(0, `hsla(${planet.hue}, 55%, 28%, ${planet.glowIntensity})`);
      glowGradient.addColorStop(0.4, `hsla(${planet.hue}, 50%, 25%, ${planet.glowIntensity * 0.3})`);
      glowGradient.addColorStop(1, "hsla(160, 50%, 25%, 0)");
      
      ctx.beginPath();
      ctx.arc(x, y, planet.radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Planet body gradient
      const planetGradient = ctx.createRadialGradient(
        x - planet.radius * 0.3,
        y - planet.radius * 0.3,
        0,
        x,
        y,
        planet.radius
      );
      planetGradient.addColorStop(0, `hsla(${planet.hue}, 45%, 40%, 0.9)`);
      planetGradient.addColorStop(0.5, `hsla(${planet.hue}, 55%, 28%, 0.8)`);
      planetGradient.addColorStop(1, `hsla(${planet.hue + 5}, 60%, 18%, 0.7)`);

      ctx.beginPath();
      ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
      ctx.fillStyle = planetGradient;
      ctx.fill();

      // Inner atmosphere ring
      const ringGradient = ctx.createRadialGradient(x, y, planet.radius * 0.9, x, y, planet.radius * 1.1);
      ringGradient.addColorStop(0, "hsla(155, 45%, 40%, 0)");
      ringGradient.addColorStop(0.5, `hsla(155, 50%, 45%, ${0.15 + Math.sin(time * 0.002) * 0.05})`);
      ringGradient.addColorStop(1, "hsla(155, 45%, 40%, 0)");

      ctx.beginPath();
      ctx.arc(x, y, planet.radius * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = ringGradient;
      ctx.fill();

      // Surface patterns (flowing lines)
      ctx.save();
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 5; i++) {
        const lineY = y - planet.radius * 0.6 + (planet.radius * 1.2 * i) / 5;
        const offset = Math.sin(time * 0.001 + i) * planet.radius * 0.1;
        
        ctx.beginPath();
        ctx.moveTo(x - planet.radius * 0.8 + offset, lineY);
        ctx.quadraticCurveTo(
          x + offset * 0.5,
          lineY + Math.sin(time * 0.002 + i * 0.5) * 10,
          x + planet.radius * 0.8 + offset,
          lineY
        );
        ctx.strokeStyle = `hsla(${planet.hue - 5}, 40%, 60%, 0.5)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawParticle = (particle: Particle, time: number) => {
      const twinkle = Math.sin(time * 0.003 + particle.x + particle.y) * 0.3 + 0.7;
      
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${particle.hue}, 50%, 60%, ${particle.opacity * twinkle})`;
      ctx.fill();
    };

    const drawFlowingLines = (time: number) => {
      ctx.save();
      ctx.globalAlpha = 0.03;
      
      for (let i = 0; i < 8; i++) {
        const yBase = (canvas.height / 8) * i;
        const amplitude = 50 + i * 10;
        
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        
        for (let x = 0; x < canvas.width; x += 20) {
          const y = yBase + Math.sin((x + time * 0.5) * 0.005 + i) * amplitude;
          ctx.lineTo(x, y);
        }
        
        ctx.strokeStyle = `hsla(${155 + i * 2}, 45%, 40%, 0.3)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    };

    const animate = (time: number) => {
      // Clear with gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bgGradient.addColorStop(0, "hsl(48, 35%, 97%)");
      bgGradient.addColorStop(0.3, "hsl(50, 30%, 94%)");
      bgGradient.addColorStop(0.6, "hsl(155, 35%, 80%)");
      bgGradient.addColorStop(1, "hsl(160, 45%, 35%)");
      
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw flowing lines
      drawFlowingLines(time);

      // Update and draw particles
      particlesRef.current.forEach((particle) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        // Wrap around screen
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        drawParticle(particle, time);
      });

      // Draw planets (back to front)
      planetsRef.current.slice().reverse().forEach((planet) => {
        planet.angle += planet.speed;
        drawPlanet(planet, time);
      });

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
      className="absolute inset-0 w-full h-full -z-10"
      style={{ pointerEvents: "none" }}
    />
  );
};

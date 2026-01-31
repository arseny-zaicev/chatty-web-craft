import { useRef, useState, useCallback, useEffect } from "react";
import salesforgeLogo from "@/assets/clients/salesforge-logo.png";
import pathosLogo from "@/assets/clients/pathos-new.png";
import fbMarketingLogo from "@/assets/clients/fb-marketing-logo.png";
import enaraLogo from "@/assets/clients/enara-logo.png";
import propAiLogo from "@/assets/clients/prop-ai-logo.png";
import moreConvosLogo from "@/assets/clients/more-convos-logo.png";
import keyDigitalLogo from "@/assets/clients/key-digital-logo.png";
import dxbRealtorLogo from "@/assets/clients/dxb-realtor-logo.png";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://www.salesforge.ai/" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com/" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://www.instagram.com/f.b.marketing/" },
  { name: "Enara Properties", logo: enaraLogo, url: "https://enaraproperties.ae/" },
  { name: "Prop AI", logo: propAiLogo, url: "https://prop-ai.com/" },
  { name: "More Convos", logo: moreConvosLogo, url: "https://moreconvos.com/" },
  { name: "Key Digital", logo: keyDigitalLogo, url: "https://key-digital.lv/" },
  { name: "DXB Realtor", logo: dxbRealtorLogo, url: "https://www.dxbrealtor.ae/" },
];

export const ClientLogos = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const animationRef = useRef<number | null>(null);

  // Auto-scroll animation
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let scrollPosition = container.scrollLeft;
    const speed = 0.5; // pixels per frame

    const animate = () => {
      if (!isPaused && !isDragging && container) {
        scrollPosition += speed;
        
        // Reset to start when we've scrolled half (since we duplicate content)
        const halfWidth = container.scrollWidth / 2;
        if (scrollPosition >= halfWidth) {
          scrollPosition = 0;
        }
        
        container.scrollLeft = scrollPosition;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPaused, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !scrollRef.current) return;
    const x = e.touches[0].pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  // Duplicate clients for seamless loop
  const duplicatedClients = [...clients, ...clients];

  return (
    <section className="py-16 border-t border-border/30 overflow-hidden">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-10 uppercase tracking-widest">
          Trusted by industry leaders
        </p>
      </div>
      
      {/* Scrollable container with auto-scroll + manual drag */}
      <div 
        ref={scrollRef}
        className={`relative py-8 bg-background/50 backdrop-blur-sm rounded-2xl mx-4 overflow-x-auto scrollbar-hide cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => { setIsPaused(false); setIsDragging(false); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={() => { setIsDragging(false); setIsPaused(false); }}
        onTouchMove={handleTouchMove}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex items-center gap-12 px-8 min-w-max">
          {duplicatedClients.map((client, idx) => (
            <a
              key={`${client.name}-${idx}`}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => isDragging && e.preventDefault()}
              className="flex-shrink-0 opacity-90 hover:opacity-100 transition-all duration-500 hover:scale-110"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                loading="eager"
                decoding="async"
                className="h-10 md:h-14 w-auto object-contain brightness-0 invert opacity-80 hover:opacity-100 transition-opacity"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
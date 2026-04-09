import { useEffect, useRef } from 'react';

const ScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = document.documentElement;
        const progress = el.scrollTop / (el.scrollHeight - el.clientHeight);
        if (barRef.current) {
          barRef.current.style.transform = `scaleX(${progress})`;
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={barRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '2px',
        transformOrigin: 'left center',
        transform: 'scaleX(0)',
        background: 'linear-gradient(90deg, hsl(152 65% 35%), hsl(152 80% 55%), hsl(38 55% 62%))',
        boxShadow: '0 0 8px hsl(152 70% 50% / 0.6)',
        zIndex: 100,
        willChange: 'transform',
        pointerEvents: 'none',
      }}
    />
  );
};

export default ScrollProgress;

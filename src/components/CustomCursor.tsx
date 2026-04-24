import { useEffect, useRef } from 'react';

const CustomCursor = () => {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(pointer: fine)').matches) return;

    let mouseX = 0;
    let mouseY = 0;
    let visible = false;
    let rafId = 0;
    let running = true;
    let dirty = false;

    const tick = () => {
      if (!running) return;
      if (dirty) {
        const el = dotRef.current;
        if (el) {
          el.style.transform = `translate(${mouseX}px,${mouseY}px) translate(-50%,-50%)`;
        }
        dirty = false;
      }
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent | MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dirty = true;
      if (!visible && dotRef.current) {
        dotRef.current.style.opacity = '1';
        visible = true;
      }
    };

    const onLeave = () => {
      if (dotRef.current) dotRef.current.style.opacity = '0';
      visible = false;
    };

    const onEnter = () => {
      if (dotRef.current) dotRef.current.style.opacity = '1';
      visible = true;
    };

    // Event delegation - no MutationObserver needed
    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest('a, button, [role="button"]');
    };

    const onOver = (e: MouseEvent) => {
      if (isInteractive(e.target)) dotRef.current?.classList.add('is-hovered');
    };
    const onOut = (e: MouseEvent) => {
      if (isInteractive(e.target)) dotRef.current?.classList.remove('is-hovered');
    };

    rafId = requestAnimationFrame(tick);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    document.addEventListener('mouseenter', onEnter, { passive: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  return (
    <>
      <style>{`
        @media (pointer: fine) {
          *, *::before, *::after { cursor: none !important; }
        }
        .cursor-dot {
          position: fixed; top: 0; left: 0;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: hsl(152 70% 48%);
          pointer-events: none;
          z-index: 99999;
          opacity: 0;
          will-change: transform;
          transition: width 0.12s ease, height 0.12s ease, background 0.12s ease, border 0.12s ease, opacity 0.15s ease;
          contain: layout style;
        }
        .cursor-dot.is-hovered {
          width: 36px; height: 36px;
          background: hsl(152 65% 45% / 0.08);
          border: 1.5px solid hsl(152 60% 42%);
        }
      `}</style>
      <div ref={dotRef} className="cursor-dot" />
    </>
  );
};

export default CustomCursor;

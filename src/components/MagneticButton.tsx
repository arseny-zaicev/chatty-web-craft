import { useRef, ReactNode } from 'react';

interface MagneticButtonProps {
  children: ReactNode;
  strength?: number;
  className?: string;
}

const MagneticButton = ({ children, strength = 0.38, className }: MagneticButtonProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const onMove = (e: React.MouseEvent) => {
    if (isTouch) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) * strength;
    const y = (e.clientY - (rect.top + rect.height / 2)) * strength;
    el.style.transition = 'transform 0s';
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  const onLeave = () => {
    if (isTouch) return;
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    el.style.transform = 'translate(0px, 0px)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ display: 'inline-block' }}
      className={className}
    >
      {children}
    </div>
  );
};

export default MagneticButton;

// ─── Shared sketch/hand-drawn SVG components ────────────────────────────────
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

const draw = (delay = 0, duration = 0.8) => ({
  initial: { pathLength: 0, opacity: 0 },
  whileInView: { pathLength: 1, opacity: 1 },
  viewport: { once: true as const },
  transition: { duration, delay, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
});

// ─── Wobbly underline ────────────────────────────────────────────────────────
export const SketchUnderline = ({
  width = 260,
  color = 'hsl(152 50% 36%)',
  delay = 0.3,
}: {
  width?: number;
  color?: string;
  delay?: number;
}) => (
  <svg viewBox="0 0 300 10" width="100%" height={10} fill="none"
    preserveAspectRatio="none"
    style={{ display: 'block', overflow: 'visible' }} aria-hidden>
    <motion.path
      d="M4 6 Q45 3 90 6.5 Q144 9.5 186 5 Q228 1 264 6.5 Q282 8.5 296 5"
      stroke={color} strokeWidth="2.2" strokeLinecap="round"
      {...draw(delay, 0.9)}
    />
    <motion.path
      d="M8 7.5 Q84 4.5 165 7 Q216 9 276 5.5"
      stroke={color} strokeWidth="1" strokeLinecap="round" strokeOpacity="0.3"
      {...draw(delay + 0.12, 0.8)}
    />
  </svg>
);

// ─── Pencil oval highlight ────────────────────────────────────────────────────
export const SketchCircle = ({
  children,
  color = 'hsl(38 50% 42%)',
  delay = 0.4,
}: {
  children: ReactNode;
  color?: string;
  delay?: number;
}) => (
  <span style={{ position: 'relative', display: 'inline-block' }}>
    {children}
    <svg viewBox="0 0 120 50" fill="none" aria-hidden
      style={{ position: 'absolute', top: '-8px', left: '-10px', width: 'calc(100% + 20px)', height: 'calc(100% + 16px)', overflow: 'visible', pointerEvents: 'none' }}>
      <motion.ellipse cx="60" cy="25" rx="57" ry="21" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round"
        {...draw(delay, 1.0)}
      />
      <motion.ellipse cx="62" cy="26" rx="55" ry="19" fill="none"
        stroke={color} strokeWidth="1" strokeLinecap="round" strokeOpacity="0.22"
        {...draw(delay + 0.15, 0.9)}
      />
    </svg>
  </span>
);

// ─── Sketch checkmark ────────────────────────────────────────────────────────
export const SketchCheck = ({
  color = 'hsl(152 50% 36%)',
  delay = 0,
  size = 20,
}: {
  color?: string;
  delay?: number;
  size?: number;
}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden style={{ flexShrink: 0 }}>
    <motion.path d="M4 13 L9 18.5 L20 6"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      {...draw(delay, 0.5)}
    />
    <motion.path d="M5 14 L9.5 19 L19.5 7"
      stroke={color} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25"
      {...draw(delay + 0.08, 0.45)}
    />
  </svg>
);

// ─── Hand-drawn section divider (wavy line) ───────────────────────────────────
export const SketchDivider = ({
  color = 'hsl(34 22% 72%)',
  delay = 0,
}: {
  color?: string;
  delay?: number;
}) => (
  <div style={{ width: '100%', overflow: 'hidden', lineHeight: 0 }} aria-hidden>
    <svg viewBox="0 0 1200 18" width="100%" height={18} preserveAspectRatio="none" fill="none">
      <motion.path
        d="M0 9 Q60 3 120 9 Q180 15 240 9 Q300 3 360 9 Q420 15 480 8 Q540 2 600 9 Q660 15 720 9 Q780 3 840 9 Q900 15 960 8 Q1020 2 1080 9 Q1140 15 1200 9"
        stroke={color} strokeWidth="1.4" strokeLinecap="round"
        {...draw(delay, 1.4)}
      />
      <motion.path
        d="M0 11 Q80 6 160 11 Q240 16 320 10 Q400 5 480 11 Q560 16 640 10 Q720 5 800 11 Q880 16 960 10 Q1040 5 1120 11 Q1160 13 1200 11"
        stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeOpacity="0.3"
        {...draw(delay + 0.1, 1.4)}
      />
    </svg>
  </div>
);

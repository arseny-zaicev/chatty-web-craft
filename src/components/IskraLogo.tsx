// Shared ISKRA brand mark - 4-pointed spark on emerald gradient.
// Matches /iskra-favicon.svg and the official avatar.
export const IskraSparkMark = ({ size = 22, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="iskra-mark-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2d9d74" />
        <stop offset="100%" stopColor="#1a4d3a" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="32" ry="32" fill="url(#iskra-mark-bg)" />
    <path d="M80 20L92 76L148 80L92 84L80 140L68 84L12 80L68 76L80 20Z" fill="#ffffff" />
  </svg>
);

export const IskraLogo = ({ size = 22, textClass = "text-xl" }: { size?: number; textClass?: string }) => (
  <div className="flex items-center gap-2.5">
    <IskraSparkMark size={size} />
    <span className={`font-display font-bold tracking-tight text-foreground ${textClass}`}>ISKRA</span>
  </div>
);

// Shared ISKRA brand mark - emerald rounded square with sparkle icon.
// Single source of truth for the in-app logo (Navbar, Footer, Admin, Auth, etc.).
import { Sparkles } from "lucide-react";

export const IskraSparkMark = ({ size = 32, className = "" }: { size?: number; className?: string }) => {
  // Inner sparkle is ~50% of the outer square, like the admin header reference.
  const inner = Math.round(size * 0.5);
  return (
    <div
      className={`rounded-lg bg-gradient-to-br from-iskra-emerald to-iskra-emerald/70 flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Sparkles size={inner} className="text-white" strokeWidth={2} />
    </div>
  );
};

export const IskraLogo = ({ size = 32, textClass = "text-base" }: { size?: number; textClass?: string }) => (
  <div className="flex items-center gap-2">
    <IskraSparkMark size={size} />
    <span className={`font-display font-semibold tracking-tight ${textClass}`}>ISKRA</span>
  </div>
);

import { Play } from "lucide-react";
import founderPhoto from "@/assets/founder/arsenijs-new.png";

interface FounderVideoPreviewProps {
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  showPlayButton?: boolean;
  className?: string;
}

export const FounderVideoPreview = ({ 
  onClick, 
  size = "md", 
  showPlayButton = true,
  className = ""
}: FounderVideoPreviewProps) => {
  const sizeClasses = {
    sm: "w-20 h-20",
    md: "w-32 h-32",
    lg: "w-44 h-44"
  };

  const playButtonSizes = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-14 h-14"
  };

  const playIconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-6 h-6"
  };

  return (
    <div 
      className={`relative group cursor-pointer ${className}`}
      onClick={onClick}
    >
      {/* Outer glow ring */}
      <div className={`${sizeClasses[size]} rounded-full absolute inset-0 bg-gradient-to-br from-iskra-emerald/40 via-iskra-emerald/20 to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity duration-300`} />
      
      {/* Animated ring */}
      <div className={`${sizeClasses[size]} rounded-full absolute animate-pulse`}>
        <div className="absolute inset-0 rounded-full border-2 border-iskra-emerald/30 animate-ping" style={{ animationDuration: '2s' }} />
      </div>
      
      {/* Main circle with gradient border */}
      <div className={`${sizeClasses[size]} relative rounded-full p-[3px] bg-gradient-to-br from-iskra-emerald via-iskra-emerald/50 to-iskra-emerald/20`}>
        {/* Inner circle with photo */}
        <div className="w-full h-full rounded-full overflow-hidden bg-background relative">
          <img 
            src={founderPhoto} 
            alt="Arseny - Founder of ISKRA"
            className="w-full h-full object-cover object-top scale-110 group-hover:scale-125 transition-transform duration-500"
          />
          
          {/* Overlay gradient on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-iskra-dark/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      </div>

      {/* Play button */}
      {showPlayButton && (
        <div className={`absolute bottom-0 right-0 ${playButtonSizes[size]} rounded-full bg-iskra-emerald flex items-center justify-center shadow-lg shadow-iskra-emerald/30 group-hover:scale-110 transition-transform duration-300`}>
          <Play className={`${playIconSizes[size]} text-background fill-background ml-0.5`} />
        </div>
      )}

      {/* Recording indicator */}
      <div className="absolute top-1 right-1">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
      </div>
    </div>
  );
};

import { useState } from "react";
import { Play, Pause, Square, Rewind, Hash, Circle, Trash2, MoreHorizontal } from "lucide-react";
import founderPhoto from "@/assets/founder/arsenijs-new.png";

interface VideoThumbnailProps {
  videoSrc: string;
  onPlay?: () => void;
}

export const VideoThumbnail = ({ videoSrc, onPlay }: VideoThumbnailProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);

  const handlePlay = () => {
    if (videoRef) {
      setIsPlaying(true);
      videoRef.play();
      videoRef.playbackRate = 1.25;
    }
    onPlay?.();
  };

  const handlePause = () => {
    if (videoRef) {
      videoRef.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-iskra-emerald/20 border border-iskra-emerald/30 bg-iskra-dark">
      {/* Browser Chrome */}
      <div className="bg-[#1a1a1a] px-4 py-2.5 flex items-center gap-3 border-b border-white/10">
        {/* Traffic Lights */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        
        {/* Tabs */}
        <div className="flex items-center gap-1 ml-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2a2a2a] rounded-t-lg text-xs text-white/70">
            <div className="w-3 h-3 rounded-sm bg-iskra-emerald/50" />
            Seller Leads for Dubai | IS...
            <span className="text-white/30">×</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/40">
            <div className="w-3 h-3 rounded-sm bg-iskra-emerald" />
            ISKRA | AI Chatbots & Whats...
            <span className="text-white/20">×</span>
          </div>
        </div>
      </div>

      {/* URL Bar */}
      <div className="bg-[#2a2a2a] px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2 text-white/30">
          <span>←</span>
          <span>→</span>
          <span>⟳</span>
        </div>
        <div className="flex-1 bg-[#1a1a1a] rounded-full px-4 py-1.5 flex items-center gap-2">
          <span className="text-white/30 text-xs">🔒</span>
          <span className="text-white/60 text-sm">iskra.ae/seller-leads</span>
        </div>
      </div>

      {/* Video Content Area */}
      <div className="relative aspect-video bg-gradient-to-br from-[#0a1a12] via-[#0d2818] to-[#0a1a12] overflow-hidden">
        {/* Website Preview Background */}
        <div className="absolute inset-0 opacity-90">
          {/* Simulated ISKRA page content */}
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2 text-white text-sm font-semibold">
                <span className="text-iskra-emerald">✦</span> ISKRA
              </div>
              <div className="flex items-center gap-6 text-white/50 text-xs">
                <span>AI Agent</span>
                <span>AI Use Cases</span>
                <span className="text-white">Seller Leads</span>
                <span>Pricing</span>
                <span>Contact</span>
              </div>
              <div className="px-3 py-1.5 bg-white text-black text-xs rounded-lg font-medium">Get Started</div>
            </div>

            {/* Content */}
            <div className="grid grid-cols-2 gap-8 mt-8">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-iskra-emerald/20 text-iskra-emerald text-[10px] mb-4">
                  <span>📊</span> Dubai's Most Comprehensive Owner Database
                </div>
                <h2 className="text-white text-2xl md:text-3xl font-bold mb-3 leading-tight">
                  Find Sellers<br />
                  <span className="text-iskra-emerald">Before They List</span>
                </h2>
                <p className="text-white/60 text-xs leading-relaxed mb-4 max-w-xs">
                  Access Dubai's most comprehensive owner database. Choose any district and building — find property owners ready to sell or rent.
                </p>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-white text-black text-[10px] rounded-lg font-medium flex items-center gap-1">
                    Get Started <span>→</span>
                  </div>
                  <div className="px-3 py-1.5 border border-white/30 text-white text-[10px] rounded-lg">
                    Learn More
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="glass-card rounded-lg p-3 bg-iskra-emerald/10 border-iskra-emerald/20">
                  <div className="text-xl font-bold text-iskra-emerald">220K+</div>
                  <div className="text-[9px] text-white/60">Owners in Database</div>
                </div>
                <div className="glass-card rounded-lg p-3 bg-iskra-emerald/10 border-iskra-emerald/20">
                  <div className="text-xl font-bold text-iskra-emerald">Quarterly</div>
                  <div className="text-[9px] text-white/60">Database Updates</div>
                </div>
                <div className="glass-card rounded-lg p-3 bg-iskra-emerald/10 border-iskra-emerald/20">
                  <div className="text-xl font-bold text-iskra-emerald">50+</div>
                  <div className="text-[9px] text-white/60">Leads Every Week</div>
                </div>
                <div className="glass-card rounded-lg p-3 bg-iskra-emerald/10 border-iskra-emerald/20">
                  <div className="text-xl font-bold text-iskra-emerald">85%</div>
                  <div className="text-[9px] text-white/60">Contact Accuracy</div>
                </div>
              </div>
            </div>
          </div>

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-iskra-emerald/20" />
        </div>

        {/* Founder Bubble - Loom style - hidden when playing */}
        {!isPlaying && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-1/3 z-20">
            <div className="relative group cursor-pointer" onClick={handlePlay}>
              {/* Outer glow */}
              <div className="absolute inset-0 w-28 h-28 md:w-36 md:h-36 rounded-full bg-gradient-to-br from-iskra-emerald/40 to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
              
              {/* Pulsing ring */}
              <div className="absolute inset-0 w-28 h-28 md:w-36 md:h-36 rounded-full border-2 border-iskra-emerald/30 animate-ping" style={{ animationDuration: '2s' }} />
              
              {/* Main circle */}
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full p-[3px] bg-gradient-to-br from-iskra-emerald via-iskra-emerald/50 to-iskra-emerald/20 relative">
                <div className="w-full h-full rounded-full overflow-hidden bg-background">
                  <img 
                    src={founderPhoto} 
                    alt="Arseny - ISKRA Founder"
                    className="w-full h-full object-cover object-top scale-125 group-hover:scale-[1.35] transition-transform duration-500"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-10 h-10 text-white fill-white" />
                  </div>
                </div>
              </div>

              {/* 3 dots menu button */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 bg-[#2a2a2a] rounded-full">
                <MoreHorizontal className="w-4 h-4 text-white/50" />
              </div>
            </div>
          </div>
        )}

        {/* Loom-style controls bar - hidden when playing */}
        {!isPlaying && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a]/90 backdrop-blur-sm rounded-full border border-white/10">
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Square className="w-3.5 h-3.5 text-white/70" />
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Play className="w-3.5 h-3.5 text-white/70" />
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Rewind className="w-3.5 h-3.5 text-white/70" />
              </button>
              <span className="text-white/50 text-xs px-2">0:00</span>
              <div className="w-px h-4 bg-white/20" />
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Hash className="w-3.5 h-3.5 text-white/70" />
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Circle className="w-3.5 h-3.5 text-white/70" />
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>
          </div>
        )}

        {/* Play button overlay when not playing */}
        {!isPlaying && (
          <button 
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors cursor-pointer group z-10"
          >
            <div className="w-20 h-20 rounded-full bg-iskra-emerald/90 flex items-center justify-center shadow-xl shadow-iskra-emerald/30 group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            </div>
          </button>
        )}

        {/* Actual video (hidden until play) */}
        <video
          ref={(ref) => setVideoRef(ref)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
          onEnded={() => setIsPlaying(false)}
          controls={isPlaying}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      </div>
    </div>
  );
};

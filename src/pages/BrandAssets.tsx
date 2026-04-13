import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import workspaceAvatar from "@/assets/logo/iskra-workspace-avatar.png";
import linkedinBanner from "@/assets/linkedin/iskra-linkedin-banner-v3.png";

// New ISKRA Logo SVG - sun/spark with rays
const IskraLogoSVG = ({ className = "", size = 64, color = "#ffffff" }: { className?: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="32" cy="32" r="4.5" fill={color}/>
    <line x1="32" y1="8" x2="32" y2="22" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="32" y1="42" x2="32" y2="56" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="8" y1="32" x2="22" y2="32" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="42" y1="32" x2="56" y2="32" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="15" y1="15" x2="24" y2="24" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="40" y1="40" x2="49" y2="49" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="49" y1="15" x2="40" y2="24" stroke={color} strokeWidth="3" strokeLinecap="round"/>
    <line x1="24" y1="40" x2="15" y2="49" stroke={color} strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

// Full Logo with Text
const FullLogo = ({ size = "md", bgColor = "transparent", textColor = "#ffffff" }: { size?: "sm" | "md" | "lg"; bgColor?: string; textColor?: string }) => {
  const sizes = {
    sm: { icon: 24, text: "text-xl", gap: "gap-2", padding: "p-4" },
    md: { icon: 40, text: "text-3xl", gap: "gap-3", padding: "p-6" },
    lg: { icon: 64, text: "text-5xl", gap: "gap-4", padding: "p-8" },
  };
  const s = sizes[size];
  return (
    <div className={`flex items-center ${s.gap} ${s.padding}`} style={{ backgroundColor: bgColor }}>
      <IskraLogoSVG size={s.icon} color={textColor} />
      <span className={`font-display ${s.text} font-bold tracking-tight`} style={{ color: textColor }}>ISKRA</span>
    </div>
  );
};

// Download helpers
const downloadSVG = (svgContent: string, filename: string) => {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const downloadPNGFromSVG = async (svgContent: string, filename: string, width: number, height: number) => {
  const svgBlob = new Blob([svgContent], { type: "image/svg+xml" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }, "image/png");
    }
    URL.revokeObjectURL(svgUrl);
  };
  img.src = svgUrl;
};

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="4.5" fill="white"/>
  <line x1="32" y1="8" x2="32" y2="22" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="32" y1="42" x2="32" y2="56" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="8" y1="32" x2="22" y2="32" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="42" y1="32" x2="56" y2="32" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="15" y1="15" x2="24" y2="24" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="40" y1="40" x2="49" y2="49" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="49" y1="15" x2="40" y2="24" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <line x1="24" y1="40" x2="15" y2="49" stroke="white" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const FULL_LOGO_SVG = (bg: string, fg: string, w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${w/2 - 32}, ${h/2 - 50})">
    <circle cx="32" cy="32" r="4.5" fill="${fg}"/>
    <line x1="32" y1="8" x2="32" y2="22" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="32" y1="42" x2="32" y2="56" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="8" y1="32" x2="22" y2="32" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="42" y1="32" x2="56" y2="32" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="15" y1="15" x2="24" y2="24" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="40" y1="40" x2="49" y2="49" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="49" y1="15" x2="40" y2="24" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
    <line x1="24" y1="40" x2="15" y2="49" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
  </g>
  <text x="${w/2}" y="${h/2 + 30}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="${fg}">ISKRA</text>
</svg>`;

const BrandAssets = () => {
  return (
    <>
      <Helmet>
        <title>Brand Assets | ISKRA</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Navbar />
      <main className="min-h-screen pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Brand Assets</h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Official ISKRA brand resources. Download logos, icons, and brand materials.
            </p>
          </div>

          {/* Logo Mark */}
          <section className="mb-16">
            <h2 className="font-display text-2xl font-bold mb-6 border-b border-border pb-3">Logo Mark</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-[180px] h-[180px] bg-[#0a0a0a] rounded-lg flex items-center justify-center">
                    <IskraLogoSVG size={90} color="#ffffff" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center mb-3">Dark background</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => downloadSVG(LOGO_SVG, "iskra-logo-white.svg")}>
                    <Download className="w-3 h-3 mr-1" /> SVG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(LOGO_SVG.replace('width="64" height="64"', 'width="512" height="512"'), "iskra-logo-white.png", 512, 512)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-[180px] h-[180px] rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d1f1a 0%, #134e3a 100%)" }}>
                    <IskraLogoSVG size={90} color="#ffffff" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center mb-3">Emerald gradient</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => downloadSVG(LOGO_SVG, "iskra-logo-emerald.svg")}>
                    <Download className="w-3 h-3 mr-1" /> SVG
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Full Logo */}
          <section className="mb-16">
            <h2 className="font-display text-2xl font-bold mb-6 border-b border-border pb-3">Full Logo</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogo size="lg" bgColor="#0a0a0a" textColor="#ffffff" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-3">Dark</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#0a0a0a", "#ffffff", 640, 200), "iskra-full-dark.png", 640, 200)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogo size="lg" bgColor="#f5f3ef" textColor="#0a0a0a" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-3">Light</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#f5f3ef", "#0a0a0a", 640, 200), "iskra-full-light.png", 640, 200)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Social Assets */}
          <section className="mb-16">
            <h2 className="font-display text-2xl font-bold mb-6 border-b border-border pb-3">Social Media</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Workspace Avatar */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <img src={workspaceAvatar} alt="ISKRA Workspace Avatar" className="w-[180px] h-[180px] rounded-lg object-cover" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-1">Workspace Avatar</p>
                <p className="text-xs text-muted-foreground/60 text-center mb-3">For WhatsApp, Slack, etc.</p>
              </div>

              {/* LinkedIn Banner */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <img src={linkedinBanner} alt="ISKRA LinkedIn Banner" className="w-full max-w-[400px] rounded-lg object-cover" />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-1">LinkedIn Banner</p>
                <p className="text-xs text-muted-foreground/60 text-center mb-3">1584 × 396</p>
              </div>
            </div>
          </section>

          {/* Colors */}
          <section className="mb-16">
            <h2 className="font-display text-2xl font-bold mb-6 border-b border-border pb-3">Brand Colors</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: "Emerald", hex: "#2d9d74", desc: "Primary" },
                { name: "Emerald Light", hex: "#34d399", desc: "Accent" },
                { name: "Dark", hex: "#0a0a0a", desc: "Background" },
                { name: "Warm", hex: "#f5f3ef", desc: "Light bg" },
              ].map(c => (
                <div key={c.hex} className="bg-card border border-border rounded-xl p-4">
                  <div className="w-full aspect-square rounded-lg mb-3" style={{ background: c.hex }} />
                  <p className="font-semibold text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.hex}</p>
                  <p className="text-xs text-muted-foreground/60">{c.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default BrandAssets;

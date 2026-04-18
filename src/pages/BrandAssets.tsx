import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Download, FileImage, Palette, LayoutGrid, Square, RectangleHorizontal, Copy } from "lucide-react";
import workspaceAvatar from "@/assets/logo/iskra-workspace-avatar.png";
import linkedinBanner from "@/assets/linkedin/iskra-linkedin-banner-v3.png";
import { useToast } from "@/hooks/use-toast";

// ISKRA Logo SVG - sun/spark with rays
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
const FullLogo = ({ size = "md", bgColor = "transparent", textColor = "#ffffff" }: { size?: "sm" | "md" | "lg" | "xl"; bgColor?: string; textColor?: string }) => {
  const sizes = {
    sm: { icon: 24, text: "text-xl", gap: "gap-2", padding: "p-4" },
    md: { icon: 40, text: "text-3xl", gap: "gap-3", padding: "p-6" },
    lg: { icon: 64, text: "text-5xl", gap: "gap-4", padding: "p-8" },
    xl: { icon: 80, text: "text-6xl", gap: "gap-5", padding: "p-10" },
  };
  const s = sizes[size];
  return (
    <div className={`flex items-center ${s.gap} ${s.padding}`} style={{ backgroundColor: bgColor }}>
      <IskraLogoSVG size={s.icon} color={textColor} />
      <span className={`font-display ${s.text} font-bold tracking-tight`} style={{ color: textColor }}>ISKRA</span>
    </div>
  );
};

// Copy color helper
const copyToClipboard = (text: string, toast: any) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied!", description: `${text} copied to clipboard` });
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

// SVG Templates
const LOGO_SVG_WHITE = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" fill="#0a0a0a"/>
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

const LOGO_SVG_BLACK = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" fill="#ffffff"/>
  <circle cx="32" cy="32" r="4.5" fill="#0a0a0a"/>
  <line x1="32" y1="8" x2="32" y2="22" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="32" y1="42" x2="32" y2="56" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="8" y1="32" x2="22" y2="32" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="42" y1="32" x2="56" y2="32" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="15" y1="15" x2="24" y2="24" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="40" y1="40" x2="49" y2="49" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="49" y1="15" x2="40" y2="24" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
  <line x1="24" y1="40" x2="15" y2="49" stroke="#0a0a0a" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const LOGO_SVG_EMERALD = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" fill="#f5f3ef"/>
  <circle cx="32" cy="32" r="4.5" fill="#2d9d74"/>
  <line x1="32" y1="8" x2="32" y2="22" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="32" y1="42" x2="32" y2="56" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="8" y1="32" x2="22" y2="32" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="42" y1="32" x2="56" y2="32" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="15" y1="15" x2="24" y2="24" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="40" y1="40" x2="49" y2="49" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="49" y1="15" x2="40" y2="24" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
  <line x1="24" y1="40" x2="15" y2="49" stroke="#2d9d74" stroke-width="3" stroke-linecap="round"/>
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
  const { toast } = useToast();

  const brandColors = [
    { name: "Emerald", hex: "#2d9d74", desc: "Primary", usage: "Main brand color, CTAs, highlights" },
    { name: "Emerald Light", hex: "#34d399", desc: "Accent", usage: "Hover states, gradients" },
    { name: "Dark", hex: "#0a0a0a", desc: "Background", usage: "Dark mode, hero sections" },
    { name: "Warm White", hex: "#f5f3ef", desc: "Light bg", usage: "Light mode backgrounds" },
    { name: "Pure White", hex: "#ffffff", desc: "Text/Cards", usage: "Text on dark, card backgrounds" },
  ];

  const logoSizes = [
    { name: "Small", size: 64, usage: "Favicons, small icons" },
    { name: "Medium", size: 128, usage: "Profiles, avatars" },
    { name: "Large", size: 256, usage: "Presentations, docs" },
    { name: "XL", size: 512, usage: "Print, high-res displays" },
    { name: "XXL", size: 1024, usage: "Billboards, large print" },
  ];

  return (
    <>
      <Helmet>
        <title>Brand Assets | ISKRA</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Navbar />
      <main className="min-h-screen pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-16">
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Brand Assets</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Official ISKRA brand resources for Google Docs, presentations, and marketing materials. 
              Download logos, icons, and brand materials in multiple formats.
            </p>
          </div>

          {/* Logo Mark - Multiple Colors */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <Square className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Logo Mark - Square Format</h2>
            </div>
            <p className="text-muted-foreground mb-6">Perfect for avatars, profile pictures, and square containers. Available in multiple color schemes.</p>
            
            <div className="grid md:grid-cols-3 gap-6">
              {/* White on Dark */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-[160px] h-[160px] bg-[#0a0a0a] rounded-lg flex items-center justify-center">
                    <IskraLogoSVG size={100} color="#ffffff" />
                  </div>
                </div>
                <p className="font-semibold text-sm text-center mb-1">White on Dark</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Best for dark backgrounds</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {logoSizes.slice(2, 5).map((s) => (
                    <Button key={s.size} size="sm" variant="outline" onClick={() => downloadPNGFromSVG(LOGO_SVG_WHITE.replace('width="512" height="512"', `width="${s.size}" height="${s.size}"`), `iskra-logo-white-${s.size}.png`, s.size, s.size)}>
                      {s.size}px
                    </Button>
                  ))}
                </div>
              </div>

              {/* Black on White */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-[160px] h-[160px] bg-white rounded-lg flex items-center justify-center border border-border">
                    <IskraLogoSVG size={100} color="#0a0a0a" />
                  </div>
                </div>
                <p className="font-semibold text-sm text-center mb-1">Black on White</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Best for light backgrounds</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {logoSizes.slice(2, 5).map((s) => (
                    <Button key={s.size} size="sm" variant="outline" onClick={() => downloadPNGFromSVG(LOGO_SVG_BLACK.replace('width="512" height="512"', `width="${s.size}" height="${s.size}"`), `iskra-logo-black-${s.size}.png`, s.size, s.size)}>
                      {s.size}px
                    </Button>
                  ))}
                </div>
              </div>

              {/* Emerald */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <div className="w-[160px] h-[160px] bg-[#f5f3ef] rounded-lg flex items-center justify-center">
                    <IskraLogoSVG size={100} color="#2d9d74" />
                  </div>
                </div>
                <p className="font-semibold text-sm text-center mb-1">Emerald</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Brand primary color</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {logoSizes.slice(2, 5).map((s) => (
                    <Button key={s.size} size="sm" variant="outline" onClick={() => downloadPNGFromSVG(LOGO_SVG_EMERALD.replace('width="512" height="512"', `width="${s.size}" height="${s.size}"`), `iskra-logo-emerald-${s.size}.png`, s.size, s.size)}>
                      {s.size}px
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Download All Sizes */}
            <div className="mt-6 bg-muted/30 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <FileImage className="w-4 h-4 text-primary" />
                <h3 className="font-semibold">All Sizes & Formats</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {logoSizes.map((s) => (
                  <div key={s.size} className="bg-card border border-border rounded-lg p-3 text-center">
                    <p className="font-semibold text-sm">{s.size} × {s.size}</p>
                    <p className="text-xs text-muted-foreground mb-2">{s.usage}</p>
                    <div className="flex gap-1 justify-center">
                      <Button size="xs" variant="ghost" className="h-7 text-xs" onClick={() => downloadPNGFromSVG(LOGO_SVG_WHITE.replace('width="512" height="512"', `width="${s.size}" height="${s.size}"`), `iskra-logo-white-${s.size}.png`, s.size, s.size)}>
                        White
                      </Button>
                      <Button size="xs" variant="ghost" className="h-7 text-xs" onClick={() => downloadPNGFromSVG(LOGO_SVG_BLACK.replace('width="512" height="512"', `width="${s.size}" height="${s.size}"`), `iskra-logo-black-${s.size}.png`, s.size, s.size)}>
                        Black
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Full Logo - Horizontal */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <RectangleHorizontal className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Full Logo - Horizontal Format</h2>
            </div>
            <p className="text-muted-foreground mb-6">Complete logo with icon and text. Ideal for document headers, website navigation, and letterheads.</p>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Dark Version */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogo size="xl" bgColor="#0a0a0a" textColor="#ffffff" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Dark Version</p>
                <p className="text-xs text-muted-foreground text-center mb-3">White on dark background</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#0a0a0a", "#ffffff", 800, 200), "iskra-full-dark.png", 800, 200)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#0a0a0a", "#ffffff", 1600, 400), "iskra-full-dark@2x.png", 1600, 400)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                </div>
              </div>

              {/* Light Version */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogo size="xl" bgColor="#ffffff" textColor="#0a0a0a" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Light Version</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Black on white background</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#ffffff", "#0a0a0a", 800, 200), "iskra-full-light.png", 800, 200)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#ffffff", "#0a0a0a", 1600, 400), "iskra-full-light@2x.png", 1600, 400)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Brand Colors */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <Palette className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Brand Colors</h2>
            </div>
            <p className="text-muted-foreground mb-6">Click any color to copy the hex code. Use these colors consistently across all materials.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {brandColors.map((c) => (
                <div key={c.hex} className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => copyToClipboard(c.hex, toast)}>
                  <div className="w-full aspect-square rounded-lg mb-3 border border-border/50" style={{ background: c.hex }} />
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{c.name}</p>
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">{c.hex}</p>
                  <p className="text-xs text-muted-foreground/70">{c.usage}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Google Docs Tips */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <LayoutGrid className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">For Google Docs</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-4">Header Logo</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  For document headers, use the <strong>Full Logo - Light Version</strong>. Insert at 200-300px width for best clarity.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(FULL_LOGO_SVG("#ffffff", "#0a0a0a", 400, 100), "iskra-header.png", 400, 100)}>
                    Download Header PNG
                  </Button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold mb-4">Document Icon</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  For document icons or small logos, use the <strong>Logo Mark - Black on White</strong> at 64px or 128px size.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(LOGO_SVG_BLACK, "iskra-icon.png", 128, 128)}>
                    Download Icon PNG
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-muted/30 rounded-xl p-6">
              <h3 className="font-semibold mb-3">Quick Tips for Google Docs</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>- Insert logo via Insert → Image → Upload from computer</li>
                <li>- Use "In line" text wrapping for headers</li>
                <li>- PNG format works best for sharp edges on all screens</li>
                <li>- For dark-themed presentations, use the White on Dark logo variants</li>
                <li>- Keep consistent spacing: at least 20px padding around the logo</li>
              </ul>
            </div>
          </section>

          {/* Social Assets */}
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <FileImage className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Social Media Assets</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Workspace Avatar */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <img src={workspaceAvatar} alt="ISKRA Workspace Avatar" className="w-[180px] h-[180px] rounded-lg object-cover" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Workspace Avatar</p>
                <p className="text-xs text-muted-foreground text-center mb-3">For WhatsApp, Slack, Google Workspace, etc.</p>
              </div>

              {/* LinkedIn Banner */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <img src={linkedinBanner} alt="ISKRA LinkedIn Banner" className="w-full max-w-[400px] rounded-lg object-cover" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">LinkedIn Banner</p>
                <p className="text-xs text-muted-foreground text-center mb-3">1584 × 396 pixels</p>
                <div className="flex justify-center">
                  <a href={linkedinBanner} download="iskra-linkedin-banner.png">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="w-4 h-4" /> Download PNG
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default BrandAssets;
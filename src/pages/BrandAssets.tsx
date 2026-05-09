import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Download, FileImage, Palette, LayoutGrid, Square, RectangleHorizontal, Copy, Sparkles } from "lucide-react";
import workspaceAvatar from "@/assets/logo/iskra-workspace-avatar.png";
import linkedinBanner from "@/assets/linkedin/iskra-linkedin-banner-v4.svg";
import { useToast } from "@/hooks/use-toast";

// Lucide Sparkles glyph - the canonical ISKRA mark (matches in-app IskraSparkMark + favicon).
const SPARKLES_PATHS = `
  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
  <path d="M20 3v4"/>
  <path d="M22 5h-4"/>
  <path d="M4 17v2"/>
  <path d="M5 18H3"/>
`;

// React preview of the Sparkles mark.
const SparklesGlyph = ({ size = 24, stroke = "#ffffff", strokeWidth = 1.6 }: { size?: number; stroke?: string; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
);

// Canonical mark = sparkles glyph centered inside an emerald rounded square (or just glyph for transparent variants).
const IskraMarkPreview = ({ size = 80, bg, glyphColor }: { size?: number; bg?: string; glyphColor: string }) => {
  const inner = Math.round(size * 0.5);
  if (!bg) {
    return <SparklesGlyph size={inner} stroke={glyphColor} strokeWidth={1.6} />;
  }
  return (
    <div className="rounded-2xl flex items-center justify-center" style={{ width: size, height: size, background: bg }}>
      <SparklesGlyph size={inner} stroke={glyphColor} strokeWidth={1.6} />
    </div>
  );
};

// Full logo (mark + ISKRA wordmark) preview
const FullLogoPreview = ({ bgColor, fgColor, markBg }: { bgColor: string; fgColor: string; markBg?: string }) => (
  <div className="flex items-center gap-4 px-10 py-8 rounded-lg" style={{ backgroundColor: bgColor }}>
    <IskraMarkPreview size={72} bg={markBg} glyphColor={markBg ? "#ffffff" : fgColor} />
    <span className="font-display text-5xl font-bold tracking-tight" style={{ color: fgColor }}>ISKRA</span>
  </div>
);

const copyToClipboard = (text: string, toast: any) => {
  navigator.clipboard.writeText(text);
  toast({ title: "Copied!", description: `${text} copied to clipboard` });
};

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

const downloadPNGFromSVG = async (svgContent: string, filename: string, width: number, height: number, transparent = false) => {
  const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (!transparent) {
        // background already in svg
      }
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

// SVG generators - all use the canonical Sparkles glyph (matches in-app mark + favicon).
// Mark layout: lucide Sparkles 24x24 path, scaled to fit a 160x160 canvas at ~50% inner size.
const sparkleInner = (color: string, scale = 4.5, tx = 26, ty = 26, sw = 1.6) =>
  `<g transform="translate(${tx} ${ty}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${SPARKLES_PATHS}</g>`;

// Transparent mark - just the glyph, no plate.
const sparkSVG = (color: string, _bg: string | null, size = 512) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">${sparkleInner(color, 4.5, 26, 26, 1.4)}</svg>`;

// Rounded plate (avatar) - emerald gradient or solid bg.
const sparkRoundedSVG = (glyph: string, bg: string, size = 512) => {
  const isGradient = bg === "emerald-gradient";
  const fillBg = isGradient ? "url(#brandG)" : bg;
  const grad = isGradient
    ? `<defs><linearGradient id="brandG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1f8f5e"/><stop offset="100%" stop-color="#166b45"/></linearGradient></defs>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">${grad}<rect width="160" height="160" rx="34" ry="34" fill="${fillBg}"/>${sparkleInner(glyph, 4.5, 26, 26, 1.6)}</svg>`;
};

// Full logo (mark + ISKRA wordmark) - 800x240 default.
const fullLogoSVG = (fg: string, bg: string | null, w = 800, h = 240, markBg: string | null = null) => {
  const isGradient = markBg === "emerald-gradient";
  const grad = isGradient
    ? `<defs><linearGradient id="brandG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1f8f5e"/><stop offset="100%" stop-color="#166b45"/></linearGradient></defs>`
    : "";
  const plate = markBg
    ? `<rect x="80" y="60" width="120" height="120" rx="26" ry="26" fill="${isGradient ? "url(#brandG)" : markBg}"/>`
    : "";
  const glyphColor = markBg ? "#ffffff" : fg;
  // Sparkles glyph centered inside the 120x120 plate area (or in the same spot if no plate).
  const glyphTransform = `translate(110, 90) scale(3.3)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 800 240">${grad}${bg ? `<rect width="800" height="240" fill="${bg}"/>` : ""}${plate}<g transform="${glyphTransform}" fill="none" stroke="${glyphColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${SPARKLES_PATHS}</g><text x="240" y="155" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="800" font-size="120" fill="${fg}" letter-spacing="-2">ISKRA</text></svg>`;
};

const BrandAssets = () => {
  const { toast } = useToast();

  // Canonical brand palette - synced 1:1 with src/index.css HSL tokens.
  const brandColors = [
    { name: "Emerald", hex: "#1f8f5e", desc: "Primary", usage: "Main brand color, CTAs" },
    { name: "Emerald Deep", hex: "#166b45", desc: "Dark variant", usage: "Hover, gradients, plate end" },
    { name: "Emerald Light", hex: "#20b873", desc: "Accent", usage: "Highlights, badges, glow" },
    { name: "Dark", hex: "#0a0a0a", desc: "Background", usage: "Dark mode bg" },
    { name: "Warm White", hex: "#f5f3ef", desc: "Light bg", usage: "Light mode bg" },
    { name: "Pure White", hex: "#ffffff", desc: "Text/Cards", usage: "Text on dark" },
  ];

  const sizes = [256, 512, 1024];

  // Color variants for transparent mark (glyph only, no plate).
  const sparkVariants = [
    { name: "White", color: "#ffffff", preview: "#0a0a0a" },
    { name: "Black", color: "#0a0a0a", preview: "#f5f3ef" },
    { name: "Emerald", color: "#1f8f5e", preview: "#f5f3ef" },
    { name: "Emerald Deep", color: "#166b45", preview: "#f5f3ef" },
    { name: "Warm White", color: "#f5f3ef", preview: "#166b45" },
  ];

  // Solid background variants (avatar / app icon style with rounded plate).
  const solidVariants = [
    { name: "Emerald Gradient", fg: "#ffffff", bg: "emerald-gradient" },
    { name: "White on Dark", fg: "#ffffff", bg: "#0a0a0a" },
    { name: "Black on White", fg: "#0a0a0a", bg: "#ffffff" },
    { name: "Emerald on Cream", fg: "#1f8f5e", bg: "#f5f3ef" },
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
              Official ISKRA brand resources. Download the spark logo in any color, with transparent or solid backgrounds, in PNG or SVG format.
            </p>
          </div>

          {/* Transparent Spark - Different Colors */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Spark Mark - Transparent Background</h2>
            </div>
            <p className="text-muted-foreground mb-6">The official Sparkles mark on a transparent canvas. Perfect for overlays, watermarks, and flexible placement on any surface.</p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {sparkVariants.map((v) => (
                <div key={v.name} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex justify-center items-center mb-4 rounded-lg aspect-square" style={{ background: v.preview }}>
                    <IskraMarkPreview size={120} glyphColor={v.color} />
                  </div>
                  <p className="font-semibold text-sm text-center mb-3">{v.name}</p>
                  <div className="flex flex-wrap gap-1.5 justify-center mb-2">
                    {sizes.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => downloadPNGFromSVG(sparkSVG(v.color, null, s), `iskra-spark-${v.name.toLowerCase().replace(" ", "-")}-${s}.png`, s, s, true)}
                      >
                        {s}px
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-7 text-xs"
                    onClick={() => downloadSVG(sparkSVG(v.color, null, 512), `iskra-spark-${v.name.toLowerCase().replace(" ", "-")}.svg`)}
                  >
                    <Download className="w-3 h-3 mr-1" /> SVG
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {/* Solid Background Spark - Avatars */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <Square className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Spark Mark - Solid Background</h2>
            </div>
            <p className="text-muted-foreground mb-6">Square format with rounded corners and the official emerald gradient. Ideal for avatars, profile pictures, and app icons.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {solidVariants.map((v) => (
                <div key={v.name} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex justify-center mb-4">
                    <IskraMarkPreview
                      size={160}
                      bg={v.bg === "emerald-gradient" ? "linear-gradient(135deg, #1f8f5e 0%, #166b45 100%)" : v.bg}
                      glyphColor={v.fg}
                    />
                  </div>
                  <p className="font-semibold text-sm text-center mb-3">{v.name}</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {sizes.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => downloadPNGFromSVG(sparkRoundedSVG(v.fg, v.bg, s), `iskra-avatar-${v.name.toLowerCase().replace(/ /g, "-")}-${s}.png`, s, s)}
                      >
                        {s}px
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Full Logo - Horizontal */}
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <RectangleHorizontal className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Full Logo - Horizontal</h2>
            </div>
            <p className="text-muted-foreground mb-6">Emerald-plated mark + ISKRA wordmark - exactly as it appears in the app, navbar, footer, and admin. Use for document headers, presentations, and letterheads.</p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Dark bg with emerald plate (canonical) */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogoPreview bgColor="#0a0a0a" fgColor="#ffffff" markBg="emerald-gradient" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Canonical on Dark</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Matches in-app navbar logo</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#0a0a0a", 800, 240, "emerald-gradient"), "iskra-full-canonical-dark.png", 800, 240)}>
                    <Download className="w-3 h-3 mr-1" /> PNG 800
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#0a0a0a", 1600, 480, "emerald-gradient"), "iskra-full-canonical-dark@2x.png", 1600, 480)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#ffffff", "#0a0a0a", 800, 240, "emerald-gradient"), "iskra-full-canonical-dark.svg")}>
                    SVG
                  </Button>
                </div>
              </div>

              {/* Light bg with emerald plate (canonical) */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogoPreview bgColor="#ffffff" fgColor="#0a0a0a" markBg="emerald-gradient" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Canonical on Light</p>
                <p className="text-xs text-muted-foreground text-center mb-3">For light docs and slides</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#0a0a0a", "#ffffff", 800, 240, "emerald-gradient"), "iskra-full-canonical-light.png", 800, 240)}>
                    <Download className="w-3 h-3 mr-1" /> PNG 800
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#0a0a0a", "#ffffff", 1600, 480, "emerald-gradient"), "iskra-full-canonical-light@2x.png", 1600, 480)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#0a0a0a", "#ffffff", 800, 240, "emerald-gradient"), "iskra-full-canonical-light.svg")}>
                    SVG
                  </Button>
                </div>
              </div>

              {/* Mono on dark - flat fallback */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogoPreview bgColor="#0a0a0a" fgColor="#ffffff" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Mono White on Dark</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Flat single-color fallback</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#0a0a0a"), "iskra-full-mono-dark.png", 800, 240)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#ffffff", "#0a0a0a"), "iskra-full-mono-dark.svg")}>
                    SVG
                  </Button>
                </div>
              </div>

              {/* Transparent */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4 rounded-lg" style={{ background: "repeating-conic-gradient(#e5e5e5 0% 25%, #ffffff 0% 50%) 50% / 20px 20px" }}>
                  <FullLogoPreview bgColor="transparent" fgColor="#0a0a0a" markBg="emerald-gradient" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Transparent (Canonical)</p>
                <p className="text-xs text-muted-foreground text-center mb-3">Emerald plate over any surface</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#0a0a0a", null, 800, 240, "emerald-gradient"), "iskra-full-transparent-black-text.png", 800, 240, true)}>
                    <Download className="w-3 h-3 mr-1" /> Black text
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", null, 800, 240, "emerald-gradient"), "iskra-full-transparent-white-text.png", 800, 240, true)}>
                    <Download className="w-3 h-3 mr-1" /> White text
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#0a0a0a", null, 800, 240, "emerald-gradient"), "iskra-full-transparent.svg")}>
                    SVG
                  </Button>
                </div>
              </div>
            </div>
          </section>
          <section className="mb-20">
            <div className="flex items-center gap-3 mb-8 border-b border-border pb-3">
              <Palette className="w-5 h-5 text-primary" />
              <h2 className="font-display text-2xl font-bold">Brand Colors</h2>
            </div>
            <p className="text-muted-foreground mb-6">Click any color to copy the hex code.</p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
              <h2 className="font-display text-2xl font-bold">For Google Docs & Slides</h2>
            </div>

            <div className="bg-muted/30 rounded-xl p-6">
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>- For dark slides: use the <strong>White spark (transparent)</strong> or <strong>White on Dark full logo</strong></li>
                <li>- For light docs: use the <strong>Black or Emerald spark (transparent)</strong> or <strong>Black on White full logo</strong></li>
                <li>- Insert via Insert → Image → Upload from computer</li>
                <li>- PNG with transparent background works best on colored backgrounds</li>
                <li>- SVG keeps perfect sharpness at any size (best for print)</li>
                <li>- Keep at least 20px clear space around the logo</li>
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
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <img src={workspaceAvatar} alt="ISKRA Workspace Avatar" className="w-[180px] h-[180px] rounded-lg object-cover" />
                </div>
                <p className="font-semibold text-sm text-center mb-1">Workspace Avatar</p>
                <p className="text-xs text-muted-foreground text-center mb-3">For WhatsApp, Slack, Google Workspace</p>
                <div className="flex justify-center">
                  <a href={workspaceAvatar} download="iskra-workspace-avatar.png">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="w-4 h-4" /> Download PNG
                    </Button>
                  </a>
                </div>
              </div>

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

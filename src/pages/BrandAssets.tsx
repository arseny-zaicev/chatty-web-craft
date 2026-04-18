import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Download, FileImage, Palette, LayoutGrid, Square, RectangleHorizontal, Copy, Sparkles } from "lucide-react";
import workspaceAvatar from "@/assets/logo/iskra-workspace-avatar.png";
import linkedinBanner from "@/assets/linkedin/iskra-linkedin-banner-v3.png";
import { useToast } from "@/hooks/use-toast";

// 4-pointed spark path (viewBox 0 0 160 160) - matches official ISKRA logo
const SPARK_PATH = "M80 0L92 56L148 80L92 104L80 160L68 104L12 80L68 56L80 0Z";

// ISKRA Spark Logo - 4-pointed star
const IskraSparkSVG = ({ size = 64, color = "#ffffff" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d={SPARK_PATH} fill={color} />
  </svg>
);

// Full logo (icon + ISKRA wordmark) preview
const FullLogoPreview = ({ bgColor, fgColor }: { bgColor: string; fgColor: string }) => (
  <div className="flex items-center gap-4 px-10 py-8 rounded-lg" style={{ backgroundColor: bgColor }}>
    <IskraSparkSVG size={64} color={fgColor} />
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

// SVG generators
const sparkSVG = (color: string, bg: string | null, size = 512) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">
${bg ? `<rect width="160" height="160" fill="${bg}"/>` : ""}
<path d="${SPARK_PATH}" fill="${color}"/>
</svg>`;

const sparkRoundedSVG = (color: string, bg: string, size = 512) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">
<rect width="160" height="160" rx="32" ry="32" fill="${bg}"/>
<path d="${SPARK_PATH}" fill="${color}"/>
</svg>`;

const fullLogoSVG = (fg: string, bg: string | null, w = 800, h = 240) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 800 240">
${bg ? `<rect width="800" height="240" fill="${bg}"/>` : ""}
<g transform="translate(120, 40) scale(1)">
  <path d="${SPARK_PATH}" fill="${fg}"/>
</g>
<text x="320" y="155" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="800" font-size="120" fill="${fg}" letter-spacing="-2">ISKRA</text>
</svg>`;

const BrandAssets = () => {
  const { toast } = useToast();

  const brandColors = [
    { name: "Emerald", hex: "#2d9d74", desc: "Primary", usage: "Main brand color, CTAs" },
    { name: "Emerald Deep", hex: "#1a7a5a", desc: "Dark variant", usage: "Hover, gradients" },
    { name: "Emerald Light", hex: "#34d399", desc: "Accent", usage: "Highlights, badges" },
    { name: "Dark", hex: "#0a0a0a", desc: "Background", usage: "Dark mode bg" },
    { name: "Warm White", hex: "#f5f3ef", desc: "Light bg", usage: "Light mode bg" },
    { name: "Pure White", hex: "#ffffff", desc: "Text/Cards", usage: "Text on dark" },
  ];

  const sizes = [256, 512, 1024];

  // Color variants for transparent spark
  const sparkVariants = [
    { name: "White", color: "#ffffff", preview: "#0a0a0a" },
    { name: "Black", color: "#0a0a0a", preview: "#f5f3ef" },
    { name: "Emerald", color: "#2d9d74", preview: "#f5f3ef" },
    { name: "Emerald Deep", color: "#1a7a5a", preview: "#f5f3ef" },
    { name: "Warm White", color: "#f5f3ef", preview: "#1a7a5a" },
  ];

  // Solid background variants
  const solidVariants = [
    { name: "White on Dark", fg: "#ffffff", bg: "#0a0a0a" },
    { name: "Black on White", fg: "#0a0a0a", bg: "#ffffff" },
    { name: "White on Emerald", fg: "#ffffff", bg: "#2d9d74" },
    { name: "Emerald on Cream", fg: "#2d9d74", bg: "#f5f3ef" },
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
              <h2 className="font-display text-2xl font-bold">Spark Logo - Transparent Background</h2>
            </div>
            <p className="text-muted-foreground mb-6">The 4-pointed spark mark on transparent background. Perfect for overlays, watermarks, and flexible placement on any surface.</p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {sparkVariants.map((v) => (
                <div key={v.name} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex justify-center items-center mb-4 rounded-lg aspect-square" style={{ background: v.preview }}>
                    <IskraSparkSVG size={80} color={v.color} />
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
              <h2 className="font-display text-2xl font-bold">Spark Logo - Solid Background</h2>
            </div>
            <p className="text-muted-foreground mb-6">Square format with rounded corners. Ideal for avatars, profile pictures, and app icons.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {solidVariants.map((v) => (
                <div key={v.name} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex justify-center mb-4">
                    <div className="w-[160px] h-[160px] rounded-2xl flex items-center justify-center" style={{ background: v.bg }}>
                      <IskraSparkSVG size={90} color={v.fg} />
                    </div>
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
            <p className="text-muted-foreground mb-6">Spark + ISKRA wordmark. Use for document headers, website navigation, presentations, and letterheads.</p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Dark bg */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogoPreview bgColor="#0a0a0a" fgColor="#ffffff" />
                </div>
                <p className="font-semibold text-sm text-center mb-3">White on Dark</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#0a0a0a"), "iskra-full-dark.png", 800, 240)}>
                    <Download className="w-3 h-3 mr-1" /> PNG 800
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#0a0a0a", 1600, 480), "iskra-full-dark@2x.png", 1600, 480)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#ffffff", "#0a0a0a"), "iskra-full-dark.svg")}>
                    SVG
                  </Button>
                </div>
              </div>

              {/* Light bg */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogoPreview bgColor="#ffffff" fgColor="#0a0a0a" />
                </div>
                <p className="font-semibold text-sm text-center mb-3">Black on White</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#0a0a0a", "#ffffff"), "iskra-full-light.png", 800, 240)}>
                    <Download className="w-3 h-3 mr-1" /> PNG 800
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#0a0a0a", "#ffffff", 1600, 480), "iskra-full-light@2x.png", 1600, 480)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#0a0a0a", "#ffffff"), "iskra-full-light.svg")}>
                    SVG
                  </Button>
                </div>
              </div>

              {/* Emerald bg */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4">
                  <FullLogoPreview bgColor="#2d9d74" fgColor="#ffffff" />
                </div>
                <p className="font-semibold text-sm text-center mb-3">White on Emerald</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#2d9d74"), "iskra-full-emerald.png", 800, 240)}>
                    <Download className="w-3 h-3 mr-1" /> PNG 800
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", "#2d9d74", 1600, 480), "iskra-full-emerald@2x.png", 1600, 480)}>
                    <Download className="w-3 h-3 mr-1" /> 2× PNG
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadSVG(fullLogoSVG("#ffffff", "#2d9d74"), "iskra-full-emerald.svg")}>
                    SVG
                  </Button>
                </div>
              </div>

              {/* Transparent */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex justify-center mb-4 rounded-lg" style={{ background: "repeating-conic-gradient(#e5e5e5 0% 25%, #ffffff 0% 50%) 50% / 20px 20px" }}>
                  <FullLogoPreview bgColor="transparent" fgColor="#0a0a0a" />
                </div>
                <p className="font-semibold text-sm text-center mb-3">Transparent (Black)</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#0a0a0a", null), "iskra-full-transparent-black.png", 800, 240, true)}>
                    <Download className="w-3 h-3 mr-1" /> PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#ffffff", null), "iskra-full-transparent-white.png", 800, 240, true)}>
                    <Download className="w-3 h-3 mr-1" /> White PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPNGFromSVG(fullLogoSVG("#2d9d74", null), "iskra-full-transparent-emerald.png", 800, 240, true)}>
                    <Download className="w-3 h-3 mr-1" /> Emerald PNG
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

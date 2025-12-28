import { Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

// ISKRA Logo SVG Component
const IskraLogoSVG = ({ className = "", size = 64, color = "#ffffff" }: { className?: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9L12 2Z" fill={color}/>
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

// Download helper function
const downloadSVG = (svgContent: string, filename: string) => {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// SVG templates for download
const logoOnlySVG = (color: string) => `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M256 77L287 200L410 256L287 312L256 435L225 312L102 256L225 200L256 77Z" fill="${color}"/>
</svg>`;

const fullLogoSVG = (bgColor: string, textColor: string) => `<svg width="400" height="120" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="120" fill="${bgColor}"/>
  <g transform="translate(40, 24)">
    <path d="M36 0L42 21L63 36L42 51L36 72L30 51L9 36L30 21L36 0Z" fill="${textColor}"/>
  </g>
  <text x="130" y="75" font-family="Space Grotesk, sans-serif" font-size="48" font-weight="700" fill="${textColor}">ISKRA</text>
</svg>`;

const bannerSVG = (withGradient: boolean) => {
  if (withGradient) {
    return `<svg width="820" height="312" viewBox="0 0 820 312" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a"/>
      <stop offset="50%" style="stop-color:#0d1f1a"/>
      <stop offset="100%" style="stop-color:#0a0a0a"/>
    </linearGradient>
    <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#22c55e;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#22c55e;stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="820" height="312" fill="url(#bgGradient)"/>
  <ellipse cx="410" cy="156" rx="300" ry="150" fill="url(#glowGradient)"/>
  <g transform="translate(320, 100)">
    <path d="M36 0L42 21L63 36L42 51L36 72L30 51L9 36L30 21L36 0Z" fill="#ffffff"/>
  </g>
  <text x="410" y="220" font-family="Space Grotesk, sans-serif" font-size="56" font-weight="700" fill="#ffffff" text-anchor="middle">ISKRA</text>
  <text x="410" y="260" font-family="Space Grotesk, sans-serif" font-size="18" fill="#a1a1aa" text-anchor="middle">AI-Powered Business Automation</text>
</svg>`;
  }
  return `<svg width="820" height="312" viewBox="0 0 820 312" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="820" height="312" fill="#0a0a0a"/>
  <g transform="translate(320, 100)">
    <path d="M36 0L42 21L63 36L42 51L36 72L30 51L9 36L30 21L36 0Z" fill="#ffffff"/>
  </g>
  <text x="410" y="220" font-family="Space Grotesk, sans-serif" font-size="56" font-weight="700" fill="#ffffff" text-anchor="middle">ISKRA</text>
  <text x="410" y="260" font-family="Space Grotesk, sans-serif" font-size="18" fill="#a1a1aa" text-anchor="middle">AI-Powered Business Automation</text>
</svg>`;
};

const avatarSVG = (size: number, bgColor: string, withGradient = false) => {
  // Звезда занимает 70% от размера, центрирована
  const starSize = size * 0.7;
  const offset = (size - starSize) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = starSize / 2;
  
  // Точки 4-конечной звезды
  const top = `${cx} ${offset}`;
  const right = `${size - offset} ${cy}`;
  const bottom = `${cx} ${size - offset}`;
  const left = `${offset} ${cy}`;
  const innerOffset = r * 0.35;
  const tr = `${cx + innerOffset} ${cy - innerOffset}`;
  const br = `${cx + innerOffset} ${cy + innerOffset}`;
  const bl = `${cx - innerOffset} ${cy + innerOffset}`;
  const tl = `${cx - innerOffset} ${cy - innerOffset}`;
  
  const starPath = `M${top}L${tr}L${right}L${br}L${bottom}L${bl}L${left}L${tl}Z`;
  
  if (withGradient) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="avatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="#0d1f1a"/>
<stop offset="100%" stop-color="#134e3a"/>
</linearGradient>
</defs>
<rect width="${size}" height="${size}" fill="url(#avatarGradient)"/>
<path d="${starPath}" fill="#ffffff"/>
</svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<rect width="${size}" height="${size}" fill="${bgColor}"/>
<path d="${starPath}" fill="#ffffff"/>
</svg>`;
};

const iconOnlyTransparentSVG = (color: string) => {
  // Звезда на прозрачном фоне, 512x512
  const size = 512;
  const starSize = size * 0.8;
  const offset = (size - starSize) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = starSize / 2;
  
  const top = `${cx} ${offset}`;
  const right = `${size - offset} ${cy}`;
  const bottom = `${cx} ${size - offset}`;
  const left = `${offset} ${cy}`;
  const innerOffset = r * 0.35;
  const tr = `${cx + innerOffset} ${cy - innerOffset}`;
  const br = `${cx + innerOffset} ${cy + innerOffset}`;
  const bl = `${cx - innerOffset} ${cy + innerOffset}`;
  const tl = `${cx - innerOffset} ${cy - innerOffset}`;
  
  const starPath = `M${top}L${tr}L${right}L${br}L${bottom}L${bl}L${left}L${tl}Z`;
  
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<path d="${starPath}" fill="${color}"/>
</svg>`;
};

export default function BrandAssets() {
  return (
    <>
      <Helmet>
        <title>Brand Assets - ISKRA</title>
        <meta name="description" content="Download ISKRA brand assets including logos, banners, and social media graphics." />
      </Helmet>

      <Navbar />
      
      <main className="min-h-screen pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Brand Assets</h1>
            <p className="text-muted-foreground text-lg mb-12">
              Скачайте логотипы ISKRA для Facebook, соцсетей и маркетинговых материалов
            </p>

            {/* Facebook Avatar 180x180 */}
            <section className="mb-16">
              <h2 className="text-2xl font-display font-semibold mb-6">Facebook Аватар (180×180)</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Dark background */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-[180px] h-[180px] bg-[#0a0a0a] rounded-lg flex items-center justify-center">
                      <IskraLogoSVG size={90} color="#ffffff" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Тёмный фон</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(avatarSVG(180, "#0a0a0a"), "iskra-avatar-dark-180x180.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>

                {/* Green/teal background */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-[180px] h-[180px] rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d1f1a 0%, #134e3a 100%)" }}>
                      <IskraLogoSVG size={90} color="#ffffff" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Зеленоватый градиент</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(avatarSVG(180, "#0d1f1a", true), "iskra-avatar-green-180x180.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>
              </div>
            </section>

            {/* Facebook Banner 820x312 */}
            <section className="mb-16">
              <h2 className="text-2xl font-display font-semibold mb-6">Facebook Баннер (820×312)</h2>
              <div className="space-y-6">
                {/* With gradient */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4 overflow-hidden rounded-lg">
                    <div 
                      className="w-full max-w-[820px] aspect-[820/312] flex flex-col items-center justify-center"
                      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #0d1f1a 50%, #0a0a0a 100%)" }}
                    >
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                        <IskraLogoSVG size={72} color="#ffffff" className="relative z-10" />
                      </div>
                      <span className="font-display text-4xl md:text-5xl font-bold text-white mt-4">ISKRA</span>
                      <span className="text-muted-foreground text-sm mt-2">AI-Powered Business Automation</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">С градиентным эффектом</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(bannerSVG(true), "iskra-facebook-banner-gradient-820x312.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>

                {/* Simple dark */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4 overflow-hidden rounded-lg">
                    <div 
                      className="w-full max-w-[820px] aspect-[820/312] bg-[#0a0a0a] flex flex-col items-center justify-center"
                    >
                      <IskraLogoSVG size={72} color="#ffffff" />
                      <span className="font-display text-4xl md:text-5xl font-bold text-white mt-4">ISKRA</span>
                      <span className="text-muted-foreground text-sm mt-2">AI-Powered Business Automation</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Простой тёмный фон</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(bannerSVG(false), "iskra-facebook-banner-dark-820x312.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>
              </div>
            </section>

            {/* Logo Only - Icon */}
            <section className="mb-16">
              <h2 className="text-2xl font-display font-semibold mb-6">Иконка логотипа</h2>
              <div className="grid md:grid-cols-3 gap-6">
                {/* White on transparent */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-32 h-32 bg-[#1a1a1a] rounded-lg flex items-center justify-center" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"20\" height=\"20\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cdefs%3E%3Cpattern id=\"grid\" width=\"20\" height=\"20\" patternUnits=\"userSpaceOnUse\"%3E%3Cpath d=\"M 20 0 L 0 0 0 20\" fill=\"none\" stroke=\"%23333\" stroke-width=\"1\"/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\"100%25\" height=\"100%25\" fill=\"url(%23grid)\"/%3E%3C/svg%3E')" }}>
                      <IskraLogoSVG size={64} color="#ffffff" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Белый (прозрачный фон)</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(iconOnlyTransparentSVG("#ffffff"), "iskra-icon-white.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>

                {/* Black on transparent */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-32 h-32 bg-white rounded-lg flex items-center justify-center">
                      <IskraLogoSVG size={64} color="#0a0a0a" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Чёрный (прозрачный фон)</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(iconOnlyTransparentSVG("#0a0a0a"), "iskra-icon-black.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>

                {/* Primary color */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="w-32 h-32 bg-[#1a1a1a] rounded-lg flex items-center justify-center">
                      <IskraLogoSVG size={64} color="#22c55e" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Зелёный (прозрачный фон)</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(iconOnlyTransparentSVG("#22c55e"), "iskra-icon-green.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>
              </div>
            </section>

            {/* Full Logo Horizontal */}
            <section className="mb-16">
              <h2 className="text-2xl font-display font-semibold mb-6">Полный логотип (горизонтальный)</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {/* White on dark */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="bg-[#0a0a0a] rounded-lg">
                      <FullLogo size="md" textColor="#ffffff" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Белый на тёмном</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(fullLogoSVG("#0a0a0a", "#ffffff"), "iskra-logo-white-on-dark.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>

                {/* Black on white */}
                <div className="rounded-xl border border-border p-6">
                  <div className="flex justify-center mb-4">
                    <div className="bg-white rounded-lg">
                      <FullLogo size="md" textColor="#0a0a0a" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center mb-4">Чёрный на белом</p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => downloadSVG(fullLogoSVG("#ffffff", "#0a0a0a"), "iskra-logo-black-on-white.svg")}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Скачать SVG
                  </Button>
                </div>
              </div>
            </section>

            {/* Usage guidelines */}
            <section className="rounded-xl border border-border p-8 bg-card">
              <h2 className="text-2xl font-display font-semibold mb-4">Рекомендации по использованию</h2>
              <ul className="space-y-3 text-muted-foreground">
                <li>• SVG файлы можно конвертировать в PNG через любой онлайн конвертер</li>
                <li>• Для Facebook аватара используйте размер 180×180 пикселей</li>
                <li>• Для Facebook баннера используйте размер 820×312 пикселей</li>
                <li>• Не искажайте пропорции логотипа</li>
                <li>• Сохраняйте достаточно пространства вокруг логотипа</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}

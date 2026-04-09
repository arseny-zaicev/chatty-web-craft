import salesforgeLogo from "@/assets/logos/salesforge.png";
import pathosLogo from "@/assets/logos/pathos.png";
import fbMarketingLogo from "@/assets/logos/fb_marketing.png";
import enaraLogo from "@/assets/logos/enara.png";
import propAiLogo from "@/assets/logos/prop_ai.png";
import moreConvosLogo from "@/assets/logos/more_convos.png";
import keyDigitalLogo from "@/assets/logos/key_digital.png";
import hffInteriorsLogo from "@/assets/logos/hff_interiors.png";
import achintLogo from "@/assets/logos/achint.png";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo },
  { name: "Pathos", logo: pathosLogo },
  { name: "FB Marketing", logo: fbMarketingLogo },
  { name: "Enara Properties", logo: enaraLogo },
  { name: "Prop AI", logo: propAiLogo },
  { name: "More Convos", logo: moreConvosLogo },
  { name: "Key Digital", logo: keyDigitalLogo },
  { name: "HFF Interiors", logo: hffInteriorsLogo },
  { name: "Achint", logo: achintLogo },
];

const track = [...clients, ...clients];

export const ClientLogos = () => (
  <section className="relative py-5 overflow-hidden">
    {/* Top rule */}
    <div
      className="absolute top-0 left-0 right-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent 5%, hsl(var(--iskra-emerald) / 0.3) 40%, hsl(var(--iskra-emerald) / 0.3) 60%, transparent 95%)",
      }}
    />

    {/* Label */}
    <p className="text-center text-[0.6rem] uppercase tracking-[0.2em] font-semibold text-muted-foreground/60 mb-4">
      Clients we've worked with
    </p>

    {/* Marquee */}
    <div className="relative w-full overflow-hidden">
      {/* Fade edges */}
      <div
        className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
        style={{
          background: "linear-gradient(to right, hsl(var(--background)), transparent)",
        }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
        style={{
          background: "linear-gradient(to left, hsl(var(--background)), transparent)",
        }}
      />

      <div className="marquee-inner" style={{ willChange: "transform" }}>
        {track.map((client, i) => (
          <div
            key={i}
            className="flex items-center justify-center flex-shrink-0 px-10 h-[44px]"
          >
            <img
              src={client.logo}
              alt={`${client.name} logo`}
              loading="eager"
              decoding="async"
              className="h-[28px] w-auto max-w-[120px] object-contain transition-all duration-300"
              style={{
                filter: "brightness(0) invert(1) opacity(1)",
                opacity: 0.35,
              }}
              onMouseEnter={(e) => {
                const img = e.currentTarget;
                img.style.opacity = "0.7";
              }}
              onMouseLeave={(e) => {
                const img = e.currentTarget;
                img.style.opacity = "0.35";
              }}
            />
          </div>
        ))}
      </div>
    </div>

    {/* Bottom rule */}
    <div
      className="absolute bottom-0 left-0 right-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent 10%, hsl(var(--iskra-emerald) / 0.2) 50%, transparent 90%)",
      }}
    />
  </section>
);

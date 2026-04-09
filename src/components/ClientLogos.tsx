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
  <section
    className="relative overflow-hidden"
    style={{ padding: "1.4rem 0 1.6rem" }}
  >
    {/* Top rule */}
    <div
      className="absolute top-0 left-0 right-0 h-px"
      style={{
        background:
          "linear-gradient(90deg, transparent 5%, hsl(0 0% 75% / 0.55) 40%, hsl(0 0% 75% / 0.55) 60%, transparent 95%)",
      }}
    />

    {/* Label */}
    <p
      style={{
        fontSize: "0.52rem",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: "hsl(0 0% 45%)",
        fontWeight: 600,
        textAlign: "center",
        marginBottom: "1.1rem",
      }}
    >
      Clients we've worked with
    </p>

    {/* Marquee */}
    <div className="relative w-full overflow-hidden">
      {/* Fade edges */}
      <div
        className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, hsl(0 0% 95%), transparent)" }}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to left, hsl(0 0% 95%), transparent)" }}
      />

      <div className="marquee-inner" style={{ willChange: "transform" }}>
        {track.map((client, i) => (
          <div
            key={i}
            className="flex items-center justify-center flex-shrink-0 h-[44px]"
            style={{ padding: "0 2.8rem" }}
          >
            <img
              src={client.logo}
              alt={`${client.name} logo`}
              loading="eager"
              decoding="async"
              style={{
                height: "26px",
                width: "auto",
                maxWidth: "120px",
                objectFit: "contain",
                filter: "grayscale(1) brightness(0.45) contrast(1.2)",
                opacity: 0.5,
                transition: "opacity 0.3s, filter 0.3s",
              }}
              onMouseEnter={(e) => {
                const img = e.currentTarget;
                img.style.opacity = "0.85";
                img.style.filter = "grayscale(0.2) brightness(0.75) contrast(1.1)";
              }}
              onMouseLeave={(e) => {
                const img = e.currentTarget;
                img.style.opacity = "0.5";
                img.style.filter = "grayscale(1) brightness(0.45) contrast(1.2)";
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
          "linear-gradient(90deg, transparent 10%, hsl(0 0% 70% / 0.4) 50%, transparent 90%)",
      }}
    />
  </section>
);

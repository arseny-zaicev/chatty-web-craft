import salesforgeLogo from "@/assets/logos/salesforge.svg";
import pathosLogo from "@/assets/logos/pathos.png";
import fbMarketingLogo from "@/assets/logos/fb_marketing.png";
import keyDigitalLogo from "@/assets/logos/key_digital.svg";
import hffInteriorsLogo from "@/assets/logos/hff_interiors.png";
import sophiasLogo from "@/assets/logos/sophias.png";
import redroverLogo from "@/assets/logos/redrover.avif";
import revbizLogo from "@/assets/logos/revbiz.webp";
import koldleadsLogo from "@/assets/logos/koldleads.png";
import cleon1Logo from "@/assets/logos/cleon1.png";
import pluralsalesLogo from "@/assets/logos/pluralsales.svg";
import recruitcloudLogo from "@/assets/logos/recruitcloud.avif";
import undergroundEcomLogo from "@/assets/logos/underground_ecom.svg";
import pnDigitalLogo from "@/assets/logos/pn_digital.svg";
import goflowLogo from "@/assets/logos/goflow.svg";

// Per-logo scale tuning so visual weight is balanced across mixed assets
// (square marks → smaller; long wordmarks → larger).
type Client = {
  name: string;
  logo: string;
  url: string;
  /** 1.0 = baseline. Use to balance visual weight. */
  scale?: number;
};

const clients: Client[] = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://salesforge.ai", scale: 1.05 },
  { name: "Goflow", logo: goflowLogo, url: "https://goflow.com", scale: 1.0 },
  { name: "Underground Ecom", logo: undergroundEcomLogo, url: "https://www.undergroundecom.com", scale: 1.25 },
  { name: "RedRover", logo: redroverLogo, url: "https://tryredrover.com", scale: 0.95 },
  { name: "The Revenue", logo: revbizLogo, url: "https://therevenue.biz", scale: 1.0 },
  { name: "PN Digital", logo: pnDigitalLogo, url: "https://pndigital.co.uk", scale: 1.0 },
  { name: "Key Digital", logo: keyDigitalLogo, url: "https://key-digital.lv", scale: 1.1 },
  { name: "RecruitCloud", logo: recruitcloudLogo, url: "https://www.recruitcloud.io", scale: 1.0 },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com", scale: 1.05 },
  { name: "Cleon1", logo: cleon1Logo, url: "https://cleon1.com", scale: 1.0 },
  { name: "Plural Sales", logo: pluralsalesLogo, url: "https://pluralsales.com", scale: 1.4 },
  { name: "Sophias", logo: sophiasLogo, url: "https://sophias.io", scale: 1.0 },
  { name: "HFF Interiors", logo: hffInteriorsLogo, url: "https://www.hffinteriors.ae", scale: 0.95 },
  { name: "KoldLeads", logo: koldleadsLogo, url: "https://www.youtube.com/@karstonfox", scale: 1.0 },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://instagram.com/f.b.marketing", scale: 1.0 },
];

const track = [...clients, ...clients];

const BASE_HEIGHT = 44; // px

export const ClientLogos = () => (
  <section
    aria-labelledby="clients-heading"
    style={{
      background: "transparent",
      padding: "3rem 0 2.75rem",
      position: "relative",
      overflow: "hidden",
    }}
  >
    <p
      id="clients-heading"
      style={{
        fontSize: "0.6rem",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "hsl(38 22% 48%)",
        fontWeight: 600,
        textAlign: "center",
        marginBottom: "2rem",
        position: "relative",
        zIndex: 1,
      }}
    >
      Clients we've worked with
    </p>

    <div style={{ overflow: "hidden", position: "relative", width: "100%", zIndex: 1 }}>
      <div className="marquee-inner" style={{ willChange: "transform" }}>
        {track.map((client, i) => {
          const h = Math.round(BASE_HEIGHT * (client.scale ?? 1));
          return (
            <a
              key={i}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${client.name}`}
              className="client-logo-link"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 2.25rem",
                height: "72px",
                width: "200px",
                flexShrink: 0,
                textDecoration: "none",
              }}
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                loading="lazy"
                decoding="async"
                draggable={false}
                width={160}
                height={h}
                className="client-logo-img"
                style={{
                  height: `${h}px`,
                  width: "auto",
                  maxWidth: "160px",
                  objectFit: "contain",
                  opacity: 0.92,
                  transition: "opacity 0.3s ease",
                  imageRendering: "auto",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "translateZ(0)",
                }}
              />
            </a>
          );
        })}
      </div>
    </div>
  </section>
);

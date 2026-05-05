import salesforgeLogo from "@/assets/logos/salesforge.svg";
import pathosLogo from "@/assets/logos/pathos.png";
import fbMarketingLogo from "@/assets/logos/fb_marketing.png";
import keyDigitalLogo from "@/assets/logos/key_digital.svg";
import hffInteriorsLogo from "@/assets/logos/hff_interiors.png";
import sophiasLogo from "@/assets/logos/sophias.png";
import redroverLogo from "@/assets/logos/redrover.svg";
import revbizLogo from "@/assets/logos/revbiz.png";
import koldleadsLogo from "@/assets/logos/koldleads.png";
import cleon1Logo from "@/assets/logos/cleon1.png";
import pluralsalesLogo from "@/assets/logos/pluralsales.svg";
import recruitcloudLogo from "@/assets/logos/recruitcloud.avif";
import undergroundEcomLogo from "@/assets/logos/underground_ecom.svg";
import pnDigitalLogo from "@/assets/logos/pn_digital.svg";
import goflowLogo from "@/assets/logos/goflow.svg";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://salesforge.ai" },
  { name: "Goflow", logo: goflowLogo, url: "https://goflow.com" },
  { name: "Underground Ecom", logo: undergroundEcomLogo, url: "https://www.undergroundecom.com" },
  { name: "RedRover", logo: redroverLogo, url: "https://tryredrover.com" },
  { name: "The Revenue", logo: revbizLogo, url: "https://therevenue.biz" },
  { name: "PN Digital", logo: pnDigitalLogo, url: "https://pndigital.co.uk" },
  { name: "Key Digital", logo: keyDigitalLogo, url: "https://key-digital.lv" },
  { name: "RecruitCloud", logo: recruitcloudLogo, url: "https://www.recruitcloud.io" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com" },
  { name: "Cleon1", logo: cleon1Logo, url: "https://cleon1.com" },
  { name: "Plural Sales", logo: pluralsalesLogo, url: "https://pluralsales.com" },
  { name: "Sophias", logo: sophiasLogo, url: "https://sophias.io" },
  { name: "HFF Interiors", logo: hffInteriorsLogo, url: "https://www.hffinteriors.ae" },
  { name: "KoldLeads", logo: koldleadsLogo, url: "https://www.youtube.com/@karstonfox" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://instagram.com/f.b.marketing" },
];

const track = [...clients, ...clients];

export const ClientLogos = () => (
  <section
    style={{
      background: 'transparent',
      padding: '3rem 0 2.75rem',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    <p
      style={{
        fontSize: '0.6rem',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'hsl(38 22% 48%)',
        fontWeight: 600,
        textAlign: 'center',
        marginBottom: '2rem',
        position: 'relative',
        zIndex: 1,
      }}
    >
      Clients we've worked with
    </p>

    <div style={{ overflow: 'hidden', position: 'relative', width: '100%', zIndex: 1 }}>
      <div className="marquee-inner" style={{ willChange: 'transform' }}>
        {track.map((client, i) => (
          <a
            key={i}
            href={client.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit ${client.name}`}
            className="client-logo-link"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3rem',
              height: '80px',
              width: '220px',
              flexShrink: 0,
              textDecoration: 'none',
            }}
          >
            <img
              src={client.logo}
              alt={`${client.name} logo`}
              loading="eager"
              decoding="async"
              draggable={false}
              width={170}
              height={48}
              className="client-logo-img"
              style={{
                height: '52px',
                width: 'auto',
                maxWidth: '180px',
                objectFit: 'contain',
                filter: 'grayscale(1) contrast(1.1)',
                opacity: 0.78,
                mixBlendMode: 'multiply',
                transition: 'opacity 0.3s ease, filter 0.3s ease',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'translateZ(0)',
              }}
            />
          </a>
        ))}
      </div>
    </div>
  </section>
);

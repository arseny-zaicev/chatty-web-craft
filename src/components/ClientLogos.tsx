import salesforgeLogo from "@/assets/logos/salesforge.png";
import pathosLogo from "@/assets/logos/pathos.png";
import fbMarketingLogo from "@/assets/logos/fb_marketing.png";
import keyDigitalLogo from "@/assets/logos/key_digital.png";
import hffInteriorsLogo from "@/assets/logos/hff_interiors.png";
import sophiasLogo from "@/assets/logos/sophias.png";
import redroverLogo from "@/assets/logos/redrover.avif";
import revbizLogo from "@/assets/logos/revbiz.webp";
import koldleadsLogo from "@/assets/logos/koldleads.png";
import cleon1Logo from "@/assets/logos/cleon1.png";
import pluralsalesLogo from "@/assets/logos/pluralsales.svg";
import recruitcloudLogo from "@/assets/logos/recruitcloud.avif";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://salesforge.ai" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://instagram.com/f.b.marketing" },
  { name: "Key Digital", logo: keyDigitalLogo, url: "https://key-digital.lv" },
  { name: "HFF Interiors", logo: hffInteriorsLogo, url: "https://www.hffinteriors.ae" },
  { name: "Sophias", logo: sophiasLogo, url: "https://sophias.io" },
  { name: "RedRover", logo: redroverLogo, url: "https://tryredrover.com" },
  { name: "The Revenue", logo: revbizLogo, url: "https://therevenue.biz" },
  { name: "KoldLeads", logo: koldleadsLogo, url: "https://www.youtube.com/@karstonfox" },
  { name: "Cleon1", logo: cleon1Logo, url: "https://cleon1.com" },
  { name: "Plural Sales", logo: pluralsalesLogo, url: "https://pluralsales.com" },
  { name: "RecruitCloud", logo: recruitcloudLogo, url: "https://www.recruitcloud.io" },
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3rem',
              height: '80px',
              flexShrink: 0,
              textDecoration: 'none',
            }}
          >
            <img
              src={client.logo}
              alt={`${client.name} logo`}
              loading="eager"
              decoding="async"
              style={{
                height: '48px',
                width: 'auto',
                maxWidth: '170px',
                objectFit: 'contain',
                filter: 'grayscale(1) brightness(0.42)',
                opacity: 0.65,
                transition: 'opacity 0.3s, filter 0.3s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.95';
                e.currentTarget.style.filter = 'grayscale(0) brightness(1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.65';
                e.currentTarget.style.filter = 'grayscale(1) brightness(0.42)';
              }}
            />
          </a>
        ))}
      </div>
    </div>
  </section>
);

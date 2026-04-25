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
  { name: "Salesforge", logo: salesforgeLogo, url: "https://www.salesforge.ai" },
  { name: "Pathos", logo: pathosLogo, url: "https://pathos.ai" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://fbmarketinginc.com" },
  { name: "Enara Properties", logo: enaraLogo, url: "https://enaraproperties.com" },
  { name: "Prop AI", logo: propAiLogo, url: "https://prop-ai.com" },
  { name: "More Convos", logo: moreConvosLogo, url: "https://moreconvos.com" },
  { name: "Key Digital", logo: keyDigitalLogo, url: "https://key-digital.lv" },
  { name: "HFF Interiors", logo: hffInteriorsLogo, url: "https://hffinteriors.com" },
  { name: "Achint", logo: achintLogo, url: "https://achint.com" },
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
    {/* Label */}
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

    {/* Full-width marquee */}
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
              padding: '0 3.5rem',
              height: '60px',
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
                height: '32px',
                width: 'auto',
                maxWidth: '130px',
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

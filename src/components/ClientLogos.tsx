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
    style={{
      background: 'linear-gradient(135deg, hsl(38 28% 84%) 0%, hsl(36 22% 90%) 35%, hsl(40 30% 86%) 60%, hsl(35 25% 88%) 100%)',
      borderTop: '1px solid hsl(38 30% 80%)',
      borderBottom: '1px solid hsl(34 22% 78%)',
      padding: '3rem 0 2.75rem',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* Shimmer sweep overlay */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(105deg, transparent 30%, hsl(42 60% 96% / 0.45) 50%, transparent 70%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer-sweep 5s ease-in-out infinite',
        pointerEvents: 'none',
      }}
    />

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
      {/* Fade edges */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '100px',
        background: 'linear-gradient(to right, hsl(38 28% 84%), transparent)',
        zIndex: 2, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '100px',
        background: 'linear-gradient(to left, hsl(35 25% 88%), transparent)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      <div className="marquee-inner" style={{ willChange: 'transform' }}>
        {track.map((client, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3.5rem',
              height: '60px',
              flexShrink: 0,
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
          </div>
        ))}
      </div>
    </div>
  </section>
);

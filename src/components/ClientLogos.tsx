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
  { name: "Salesforge", logo: salesforgeLogo, url: "https://www.salesforge.ai/" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com/" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://www.instagram.com/f.b.marketing/" },
  { name: "Enara Properties", logo: enaraLogo, url: "https://enaraproperties.ae/" },
  { name: "Prop AI", logo: propAiLogo, url: "https://prop-ai.com/" },
  { name: "More Convos", logo: moreConvosLogo, url: "https://moreconvos.com/" },
  { name: "Key Digital", logo: keyDigitalLogo, url: "https://key-digital.lv/" },
  { name: "HFF Interiors", logo: hffInteriorsLogo, url: "https://interiorsfitout.com/" },
  { name: "Achint", logo: achintLogo, url: "#" },
];

export const ClientLogos = () => {
  // Duplicate for seamless loop
  const allLogos = [...clients, ...clients];

  return (
    <section className="py-16 border-t border-border/30 overflow-hidden">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-10 uppercase tracking-widest font-body">
          Trusted by industry leaders
        </p>
      </div>

      <div className="marquee-track">
        <div className="marquee-inner">
          {allLogos.map((client, idx) => (
            <a
              key={`${client.name}-${idx}`}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              className="marquee-logo-item"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                loading="eager"
                decoding="async"
                className="marquee-logo-img"
              />
              {idx < allLogos.length - 1 && <span className="marquee-logo-divider" />}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

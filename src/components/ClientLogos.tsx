import salesforgeLogo from "@/assets/clients/salesforge-new.png";
import pathosLogo from "@/assets/clients/pathos-new.png";
import fbMarketingLogo from "@/assets/clients/fb-marketing-logo.png";
import enaraLogo from "@/assets/clients/enara-logo.png";
import propAiLogo from "@/assets/clients/prop-ai-logo.png";
import moreConvosLogo from "@/assets/clients/more-convos-logo.png";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://www.salesforge.ai/" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com/" },
  { name: "FB Marketing", logo: fbMarketingLogo, url: "https://www.instagram.com/f.b.marketing/" },
  { name: "Enara Properties", logo: enaraLogo, url: "https://enaraproperties.ae/" },
  { name: "Prop AI", logo: propAiLogo, url: "https://prop-ai.com/" },
  { name: "More Convos", logo: moreConvosLogo, url: "https://moreconvos.com/" },
];

export const ClientLogos = () => {
  return (
    <section className="py-16 border-t border-border/30 overflow-hidden">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-10 uppercase tracking-widest">
          Trusted by industry leaders
        </p>
      </div>
      
      {/* Marquee container */}
      <div className="relative py-8 bg-background/50 backdrop-blur-sm rounded-2xl mx-4">
        <div className="flex animate-marquee-slow items-center">
          {[...clients, ...clients, ...clients, ...clients].map((client, idx) => (
            <a
              key={`${client.name}-${idx}`}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 mx-16 opacity-90 hover:opacity-100 transition-all duration-500 hover:scale-110"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                className="h-10 md:h-14 w-auto object-contain brightness-0 invert opacity-80 hover:opacity-100 transition-opacity"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

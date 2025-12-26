import salesforgeLogo from "@/assets/clients/salesforge-new.png";
import pathosLogo from "@/assets/clients/pathos-new.png";
import leadbookLogo from "@/assets/clients/leadbook-new.png";
import fbMediaLogo from "@/assets/clients/fb-media-new.png";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo, url: "https://www.salesforge.ai/" },
  { name: "Pathos", logo: pathosLogo, url: "https://payonresultspr.com/" },
  { name: "Leadbook", logo: leadbookLogo, url: "https://www.leadbook.app/home57663300" },
  { name: "FB Media", logo: fbMediaLogo, url: "https://www.instagram.com/f.b.marketing/" },
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
      <div className="relative">
        <div className="flex animate-marquee-slow">
          {[...clients, ...clients, ...clients, ...clients].map((client, idx) => (
            <a
              key={`${client.name}-${idx}`}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 mx-10 opacity-70 hover:opacity-100 transition-all duration-500 hover:scale-110 grayscale hover:grayscale-0"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                className="h-12 md:h-16 w-auto object-contain"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

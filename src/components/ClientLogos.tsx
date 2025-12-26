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
    <section className="py-16 border-t border-border/30">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-10 uppercase tracking-widest">
          Trusted by industry leaders
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
          {clients.map((client) => (
            <a
              key={client.name}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-90 hover:opacity-100 transition-all duration-300 hover:scale-105 bg-white/90 rounded-lg px-4 py-2"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                className="h-8 md:h-10 w-auto object-contain"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

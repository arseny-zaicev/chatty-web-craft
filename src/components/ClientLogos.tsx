import salesforgeLogo from "@/assets/clients/salesforge-2.jpeg";
import pathosLogo from "@/assets/clients/pathos.png";
import leadbookLogo from "@/assets/clients/leadbook.png";
import fbMediaLogo from "@/assets/clients/fb-media.png";

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
        <div className="flex flex-wrap justify-center items-center gap-10 md:gap-16">
          {clients.map((client) => (
            <a
              key={client.name}
              href={client.url}
              target="_blank"
              rel="noopener noreferrer"
              className="grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all duration-300 hover:scale-105"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                className="h-12 md:h-14 w-auto object-contain"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

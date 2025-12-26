import salesforgeLogo from "@/assets/clients/salesforge-2.jpeg";
import pathosLogo from "@/assets/clients/pathos.png";
import leadbookLogo from "@/assets/clients/leadbook.png";
import fbMediaLogo from "@/assets/clients/fb-media.png";

const clients = [
  { name: "Salesforge", logo: salesforgeLogo },
  { name: "Pathos", logo: pathosLogo },
  { name: "Leadbook", logo: leadbookLogo },
  { name: "FB Media", logo: fbMediaLogo },
];

export const ClientLogos = () => {
  return (
    <section className="py-16 border-t border-border/30">
      <div className="container mx-auto px-4">
        <p className="text-center text-sm text-muted-foreground mb-8 uppercase tracking-widest">
          Trusted by industry leaders
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
          {clients.map((client) => (
            <div
              key={client.name}
              className="grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300"
            >
              <img
                src={client.logo}
                alt={`${client.name} logo`}
                className="h-8 md:h-10 w-auto object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

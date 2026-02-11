import { Play, Building, ShoppingCart, Briefcase, Globe } from "lucide-react";
import { ScrollReveal } from "@/hooks/useScrollReveal";

const stories = [
  {
    icon: Building,
    industry: "Real Estate",
    title: "How a Dubai brokerage got 47 booked viewings in 2 weeks",
    status: "coming_soon",
  },
  {
    icon: ShoppingCart,
    industry: "E-commerce",
    title: "How a DTC brand re-engaged 3,000 dormant customers via WhatsApp",
    status: "coming_soon",
  },
  {
    icon: Briefcase,
    industry: "B2B SaaS",
    title: "How a SaaS startup booked 23 demos from cold outreach",
    status: "coming_soon",
  },
  {
    icon: Globe,
    industry: "Agency",
    title: "How an agency filled their pipeline with WhatsApp in 30 days",
    status: "coming_soon",
  },
];

export const SuccessStories = () => {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-iskra-emerald text-sm font-semibold uppercase tracking-widest mb-3">
              Success Stories
            </p>
            <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">
              How This Strategy Worked <span className="text-gradient">Across Industries</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Different niches, same engine. Video case studies from real clients.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {stories.map((story, index) => {
            const Icon = story.icon;
            return (
              <ScrollReveal key={story.title} delay={index * 100}>
                <div className="glass-card rounded-2xl overflow-hidden hover-lift group">
                  {/* Video placeholder */}
                  <div className="aspect-video bg-gradient-to-br from-iskra-emerald/10 to-background flex items-center justify-center relative">
                    <div className="w-16 h-16 rounded-full bg-iskra-emerald/20 border border-iskra-emerald/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-iskra-emerald ml-0.5" />
                    </div>
                    <span className="absolute bottom-3 right-3 text-xs bg-background/80 backdrop-blur px-2 py-1 rounded text-muted-foreground">
                      Coming soon
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-iskra-emerald" />
                      <span className="text-xs font-semibold text-iskra-emerald">{story.industry}</span>
                    </div>
                    <h3 className="font-headline text-base font-bold leading-snug">{story.title}</h3>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

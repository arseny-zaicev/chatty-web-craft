import { Play, Mail, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";

export const FounderSection = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-iskra-emerald/5 to-transparent" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Meet the <span className="text-gradient">Founder</span>
            </h2>
            <p className="text-muted-foreground">
              The person behind ISKRA Digital
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Photo Placeholder */}
            <div className="relative">
              <div className="aspect-[4/5] rounded-2xl bg-secondary/50 border border-border/50 flex items-center justify-center overflow-hidden">
                {/* Placeholder for founder photo */}
                <div className="text-center p-8">
                  <div className="w-24 h-24 rounded-full bg-iskra-emerald/20 border-2 border-dashed border-iskra-emerald/40 mx-auto mb-4 flex items-center justify-center">
                    <span className="text-4xl text-iskra-emerald/60">👤</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Founder photo placeholder
                  </p>
                </div>
              </div>
              
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-iskra-emerald/10 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-iskra-emerald/10 rounded-full blur-3xl" />
            </div>

            {/* Content */}
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-2xl font-bold mb-2">
                  [Founder Name]
                </h3>
                <p className="text-iskra-emerald font-medium">
                  Founder & CEO, ISKRA Digital
                </p>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                [Brief bio about the founder - their background, expertise, and vision for ISKRA Digital. What drives them and why they started this company.]
              </p>

              {/* Video Message Placeholder */}
              <div className="glass-card rounded-xl p-4 border border-border/50">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-iskra-emerald/20 flex items-center justify-center">
                    <Play className="w-6 h-6 text-iskra-emerald" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Video Introduction</p>
                    <p className="text-xs text-muted-foreground">
                      Watch a personal message from our founder
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    Coming Soon
                  </Button>
                </div>
              </div>

              {/* Social Links */}
              <div className="flex gap-4 pt-4">
                <a
                  href="#"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </a>
                <a
                  href="#"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

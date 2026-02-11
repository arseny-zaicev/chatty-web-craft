import { Instagram, Linkedin, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import founderPhoto from "@/assets/founder/arsenijs-new.png";
import { FounderVideoPreview } from "./FounderVideoPreview";

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
              The person behind ISKRA
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Founder Photo */}
            <div className="relative">
              <div className="aspect-[4/5] rounded-2xl bg-secondary/50 border border-border/50 overflow-hidden">
                <img 
                  src={founderPhoto} 
                  alt="Arseny Zaicev - Founder & CEO of ISKRA"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-iskra-emerald/10 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-iskra-emerald/10 rounded-full blur-3xl" />
            </div>

            {/* Content */}
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-2xl font-bold mb-2">
                  Arseny Zaicev
                </h3>
                <p className="text-iskra-emerald font-medium">
                  Founder & CEO, ISKRA
                </p>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                We've been in the WhatsApp outreach space for <span className="text-iskra-emerald font-semibold">over 2 years</span>, sending <span className="text-iskra-emerald font-semibold">1M+ messages</span> across dozens of campaigns. During that time, we've tested every possible technical setup — from basic bulk senders to enterprise APIs.
              </p>
              
              <p className="text-muted-foreground leading-relaxed">
                The result? A proprietary infrastructure built specifically to <span className="text-iskra-emerald font-semibold">eliminate bans and blocks</span> — warm-up sequences, account rotation, smart throttling, and compliance safeguards that keep your campaigns running without interruption.
              </p>

              {/* Video Preview */}
              <div className="glass-card rounded-xl p-4 border border-border/50">
                <div className="flex items-center gap-4">
                  <FounderVideoPreview size="sm" showPlayButton={true} />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Video Introduction</p>
                    <p className="text-xs text-muted-foreground">
                      Watch a personal message from our founder
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">
                    Coming Soon
                  </span>
                </div>
              </div>

              {/* Social Links */}
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText("arseny@iskra.ae");
                    toast.success("Email copied to clipboard!");
                  }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
                  title="Click to copy"
                >
                  <Mail className="w-4 h-4" />
                  <span className="group-hover:underline">arseny@iskra.ae</span>
                </button>
                <a
                  href="http://wa.me/971568785008"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-iskra-emerald transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </a>
                <a
                  href="https://www.instagram.com/arszaicev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Instagram className="w-4 h-4" />
                  <span>Instagram</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/arsenijs-zaicevs-45419b323/"
                  target="_blank"
                  rel="noopener noreferrer"
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

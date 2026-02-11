import { ScrollReveal } from "@/hooks/useScrollReveal";
import { MessageCircle } from "lucide-react";

export const FAQ = () => {
  return (
    <section id="faq" className="py-20">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <div className="flex flex-col items-center text-center">
            <p className="text-muted-foreground text-sm mb-3">Still have a question?</p>
            <a
              href="https://wa.me/971568785008"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-iskra-emerald hover:text-iskra-emerald-light transition-colors font-semibold text-lg group"
            >
              <span>Chat with us on WhatsApp</span>
              <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

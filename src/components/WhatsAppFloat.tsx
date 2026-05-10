import { useState, useEffect } from "react";
import { MessageCircle, X } from "lucide-react";

export const WhatsAppFloat = () => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed || !visible) return null;

  return (
    <div className="fixed bottom-24 right-4 md:bottom-20 md:right-6 z-[60] flex flex-col items-end gap-3 animate-fade-in">
      {/* Tooltip - desktop only to avoid overlapping content on tablets/laptops */}
      <div className="relative glass-card rounded-xl px-4 py-3 max-w-[200px] border-iskra-emerald/20 shadow-xl hidden xl:block">
        <button
          onClick={() => setDismissed(true)}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          aria-label="Close"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
        <p className="text-xs text-foreground/80 leading-snug">
          Have a question? Chat with us on WhatsApp.
        </p>
      </div>

      {/* Button */}
      <a
        href="https://wa.me/971568785008"
        target="_blank"
        rel="noopener noreferrer"
        className="w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#20bd5a] flex items-center justify-center shadow-lg shadow-[#25D366]/30 transition-all hover:scale-105"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="w-6 h-6 text-white" />
      </a>
    </div>
  );
};

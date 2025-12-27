import { useState, useEffect } from "react";
import { X, Bot, MessageCircle, Building, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const services = [
  {
    id: "ai-agent",
    icon: Bot,
    title: "Automate my sales conversations",
    description: "AI agent handles leads, books meetings 24/7",
    action: "/#chatbot",
  },
  {
    id: "whatsapp",
    icon: MessageCircle,
    title: "Reach more prospects at scale",
    description: "WhatsApp outreach with 98% delivery rate",
    action: "/#services",
  },
  {
    id: "seller-leads",
    icon: Building,
    title: "Get property seller contacts",
    description: "Verified leads in Dubai, pay per lead",
    action: "/seller-leads",
  },
  {
    id: "explore",
    icon: Sparkles,
    title: "See how it works first",
    description: "View real use cases and results",
    action: "/ai-agent",
  },
];

export const ServiceRouterPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if popup was already shown this session
    const shown = sessionStorage.getItem("iskra-popup-shown");
    if (shown) {
      setHasShown(true);
      return;
    }

    // Show popup after 13 seconds
    const timer = setTimeout(() => {
      setIsOpen(true);
      setHasShown(true);
      sessionStorage.setItem("iskra-popup-shown", "true");
    }, 13000);

    return () => clearTimeout(timer);
  }, []);

  const handleServiceClick = (action: string) => {
    setIsOpen(false);
    
    if (action.startsWith("/#")) {
      const sectionId = action.substring(2);
      if (window.location.pathname !== "/") {
        navigate("/");
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      navigate(action);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />
      
      {/* Popup */}
      <div className="relative bg-card border border-border rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-fade-in">
        {/* Close button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold text-iskra-emerald tracking-wider uppercase mb-3">
            Quick Navigator
          </p>
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
            What are you looking for?
          </h2>
          <p className="text-muted-foreground">
            Select what fits your needs — we'll guide you.
          </p>
        </div>

        {/* Service Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((service) => (
            <button
              key={service.id}
              onClick={() => handleServiceClick(service.action)}
              className="flex flex-col items-start p-4 rounded-xl bg-muted/50 border border-border hover:border-iskra-emerald/50 hover:bg-muted transition-all duration-200 text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-iskra-emerald/10 flex items-center justify-center mb-3 group-hover:bg-iskra-emerald/20 transition-colors">
                <service.icon className="w-5 h-5 text-iskra-emerald" />
              </div>
              <p className="font-semibold text-sm mb-1 group-hover:text-iskra-emerald transition-colors">
                {service.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {service.description}
              </p>
            </button>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          100+ businesses automated their sales with ISKRA
        </p>
      </div>
    </div>
  );
};

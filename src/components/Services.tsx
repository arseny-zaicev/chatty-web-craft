import { Bot, MessageSquare, Globe, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const services = [
  {
    icon: Bot,
    title: "AI Chatbot",
    subtitle: "Primary Product",
    description: "Intelligent conversational AI that handles customer inquiries 24/7. Automated lead qualification, booking, and support.",
    features: ["24/7 Customer Support", "Lead Qualification", "Appointment Booking", "Multi-language Support"],
    highlight: true,
  },
  {
    icon: MessageSquare,
    title: "WhatsApp Outreach",
    subtitle: "Add-on",
    description: "Professional outreach campaigns with warm-up systems, validated contacts, and detailed analytics.",
    features: ["7-Day Warm-Up", "98% Delivery Rate", "Daily Analytics", "Copy Optimization"],
    highlight: false,
  },
  {
    icon: Globe,
    title: "Web Development",
    subtitle: "Add-on",
    description: "Design and build websites that convert. Landing pages, CRM integrations, and lead tracking.",
    features: ["Landing Pages", "CRM Integration", "Lead Tracking", "Responsive Design"],
    highlight: false,
  },
];

export const Services = () => {
  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="chatbot" className="py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Our Services
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Expand your communication power with our AI-driven solutions and creative add-ons.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {services.map((service, index) => (
            <div
              key={service.title}
              className={`rounded-3xl p-8 transition-all duration-300 hover:-translate-y-2 ${
                service.highlight
                  ? "bg-gradient-to-br from-iskra-emerald to-iskra-emerald-dark text-primary-foreground shadow-glow"
                  : "glass-card"
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 ${
                service.highlight 
                  ? "bg-primary-foreground/20 text-primary-foreground" 
                  : "bg-iskra-emerald/10 text-iskra-emerald"
              }`}>
                {service.subtitle}
              </div>
              
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${
                service.highlight 
                  ? "bg-primary-foreground/20" 
                  : "bg-iskra-emerald/10"
              }`}>
                <service.icon className={`w-7 h-7 ${
                  service.highlight ? "text-primary-foreground" : "text-iskra-emerald"
                }`} />
              </div>
              
              <h3 className="font-display text-2xl font-bold mb-3">
                {service.title}
              </h3>
              
              <p className={`mb-6 leading-relaxed ${
                service.highlight ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}>
                {service.description}
              </p>
              
              <ul className="space-y-2 mb-8">
                {service.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      service.highlight ? "bg-primary-foreground" : "bg-iskra-emerald"
                    }`} />
                    <span className={service.highlight ? "text-primary-foreground/90" : ""}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              
              <Button
                variant={service.highlight ? "glass" : "outline"}
                className={`w-full group ${
                  service.highlight 
                    ? "bg-primary-foreground/20 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/30" 
                    : ""
                }`}
                onClick={scrollToContact}
              >
                Learn More
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

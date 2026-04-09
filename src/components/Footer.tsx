import { useNavigate, useLocation } from "react-router-dom";
import { Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

const footerLinks = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Results", href: "/#testimonials" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Request a Demo", href: "/demo", isPage: true },
  { label: "Client Login", href: "/client-auth", isPage: true },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy", isPage: true },
  { label: "Terms of Service", href: "/terms", isPage: true },
];

// ISKRA Logo Component
const IskraLogo = () => (
  <div className="flex items-center gap-2.5">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
      <path d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9L12 2Z" fill="currentColor"/>
    </svg>
    <span className="font-display text-lg font-bold tracking-tight">ISKRA</span>
  </div>
);

export const Footer = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    
    if (href.startsWith("/#")) {
      const sectionId = href.substring(2);
      
      if (location.pathname !== "/") {
        navigate("/");
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }
    } else if (href.startsWith("/")) {
      navigate(href);
    }
  };

  return (
    <footer className="py-16 border-t border-border bg-background/50">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Logo & Description */}
          <div className="md:col-span-1">
            <a 
              href="/"
              onClick={(e) => {
                e.preventDefault();
                if (location.pathname !== "/") {
                  navigate("/");
                }
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hover:opacity-80 transition-opacity cursor-pointer inline-block mb-4"
            >
              <IskraLogo />
            </a>
            <p className="text-sm text-muted-foreground mb-4">
              WhatsApp outreach infrastructure that delivers qualified replies and booked calls.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 text-iskra-emerald" />
              <span>Made in Dubai 🇦🇪</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Navigation</h4>
            <nav className="flex flex-col gap-3">
              {footerLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Legal</h4>
            <nav className="flex flex-col gap-3">
              {legalLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Contact</h4>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText("arseny@iskra.ae");
                  toast.success("Email copied to clipboard!");
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
                title="Click to copy"
              >
                <Mail className="w-4 h-4 text-iskra-emerald" />
                <span className="group-hover:underline">arseny@iskra.ae</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} ISKRA. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Operating Worldwide
          </p>
        </div>
      </div>
    </footer>
  );
};
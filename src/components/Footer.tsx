import { useNavigate, useLocation } from "react-router-dom";

const footerLinks = [
  { label: "AI Agent", href: "/#chatbot" },
  { label: "AI Use Cases", href: "/ai-agent", isPage: true },
  { label: "Seller Leads", href: "/seller-leads", isPage: true },
  { label: "Services", href: "/#services" },
  { label: "Contact", href: "/#contact" },
];

// ISKRA Logo Component
const IskraLogo = () => (
  <div className="flex items-center gap-2">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor"/>
      <circle cx="12" cy="10" r="2" fill="currentColor" opacity="0.6"/>
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
    <footer className="py-12 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <IskraLogo />

          {/* Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6">
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

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            Built by ISKRA SYSTEM · Operating Worldwide
          </p>
        </div>
      </div>
    </footer>
  );
};

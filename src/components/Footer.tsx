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
    <footer className="py-12 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <a 
            href="/"
            onClick={(e) => {
              e.preventDefault();
              if (location.pathname !== "/") {
                navigate("/");
              }
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="hover:opacity-80 transition-opacity cursor-pointer"
          >
            <IskraLogo />
          </a>

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

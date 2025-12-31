import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "AI Agent", href: "/#chatbot" },
  { label: "AI Use Cases", href: "/ai-agent", isPage: true },
  { label: "Seller Leads", href: "/seller-leads", isPage: true },
  { label: "Pricing", href: "/#pricing", sellerLeadsHref: "/seller-leads#pricing" },
  { label: "Contact", href: "/#contact" },
];

// ISKRA Logo Component with spark icon
const IskraLogo = () => (
  <div className="flex items-center gap-2.5">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
      <path d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9L12 2Z" fill="currentColor"/>
    </svg>
    <span className="font-display text-xl font-bold tracking-tight text-foreground">ISKRA</span>
  </div>
);

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isSellerLeadsPage = location.pathname === "/seller-leads";

  const getHref = (item: typeof navItems[0]) => {
    // If on Seller Leads page and item has a special href for that page, use it
    if (isSellerLeadsPage && item.sellerLeadsHref) {
      return item.sellerLeadsHref;
    }
    return item.href;
  };

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: typeof navItems[0]) => {
    e.preventDefault();
    const href = getHref(item);
    
    if (href.startsWith("/seller-leads#")) {
      const sectionId = href.split("#")[1];
      if (location.pathname === "/seller-leads") {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      } else {
        navigate("/seller-leads");
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } else if (href.startsWith("/#")) {
      const sectionId = href.substring(2);
      
      if (location.pathname !== "/") {
        navigate("/");
        setTimeout(() => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              item.isPage ? (
                <Link
                  key={item.label}
                  to={item.href}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={getHref(item)}
                  onClick={(e) => handleNavClick(e, item)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  {item.label}
                </a>
              )
            ))}
          </div>

          {/* CTA Button */}
          <div className="hidden md:block">
            <a 
              href="/#contact"
              onClick={(e) => handleNavClick(e, { label: "Contact", href: "/#contact" })}
            >
              <Button variant="hero" size="default">
                Get Started
              </Button>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border/50 animate-fade-in">
            <div className="flex flex-col gap-4">
              {navItems.map((item) => (
                item.isPage ? (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 py-2"
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={getHref(item)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 py-2"
                    onClick={(e) => {
                      handleNavClick(e, item);
                      setIsOpen(false);
                    }}
                  >
                    {item.label}
                  </a>
                )
              ))}
              <a 
                href="/#contact" 
                onClick={(e) => {
                  handleNavClick(e, { label: "Contact", href: "/#contact" });
                  setIsOpen(false);
                }}
              >
                <Button variant="hero" size="default" className="mt-2 w-full">
                  Get Started
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

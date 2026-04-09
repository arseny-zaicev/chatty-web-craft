import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Results", href: "/#testimonials" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Request a Demo", href: "/demo", isPage: true },
];

const IskraLogo = () => (
  <div className="flex items-center gap-2.5">
    <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
      <circle cx="32" cy="32" r="4.5" fill="currentColor"/>
      <line x1="32" y1="8" x2="32" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="32" y1="42" x2="32" y2="56" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="8" y1="32" x2="22" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="42" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="15" y1="15" x2="24" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="40" y1="40" x2="49" y2="49" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="49" y1="15" x2="40" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="24" y1="40" x2="15" y2="49" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
    <span className="font-display text-xl font-bold tracking-tight text-foreground">ISKRA</span>
  </div>
);

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: typeof navItems[0]) => {
    e.preventDefault();
    const href = item.href;

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
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              if (location.pathname !== "/") navigate("/");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="hover:opacity-80 transition-opacity cursor-pointer"
          >
            <IskraLogo />
          </a>

          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) =>
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
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  {item.label}
                </a>
              )
            )}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/client-auth"
              className="text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors duration-200"
            >
              Client Login
            </Link>
            <Link to="/demo">
              <Button variant="hero" size="default">
                Get Started
              </Button>
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isOpen && (
          <div className="md:hidden py-4 border-t border-border/50 animate-fade-in">
            <div className="flex flex-col gap-4">
              {navItems.map((item) =>
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
                    href={item.href}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 py-2"
                    onClick={(e) => {
                      handleNavClick(e, item);
                      setIsOpen(false);
                    }}
                  >
                    {item.label}
                  </a>
                )
              )}
              <Link
                to="/client-auth"
                className="text-sm font-medium text-muted-foreground/70 hover:text-foreground transition-colors duration-200 py-2 border-t border-border/30 pt-4"
                onClick={() => setIsOpen(false)}
              >
                Client Login
              </Link>
              <Link to="/demo" onClick={() => setIsOpen(false)}>
                <Button variant="hero" size="default" className="mt-2 w-full">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

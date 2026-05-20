import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { IskraLogo } from "@/components/IskraLogo";

const navItems = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Results", href: "/#testimonials" },
  { label: "Testimonials", href: "/#testimonials" },
  { label: "Pricing", href: "/#pricing" },
];

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
            {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  {item.label}
                </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/portal-auth"
              className="text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors duration-200"
            >
              Client Login
            </Link>
            <Link to="/demo">
              <Button variant="hero" size="default">
                Book a Demo
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
              {navItems.map((item) => (
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
              ))}
              <Link
                to="/portal-auth"
                className="text-sm font-medium text-muted-foreground/70 hover:text-foreground transition-colors duration-200 py-2 border-t border-border/30 pt-4"
                onClick={() => setIsOpen(false)}
              >
                Client Login
              </Link>
              <Link to="/demo" onClick={() => setIsOpen(false)}>
                <Button variant="hero" size="default" className="mt-2 w-full">
                  Book a Demo
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

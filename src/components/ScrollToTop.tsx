import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Disable browser's automatic scroll restoration so refresh always starts at top
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

export const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // Allow in-page anchor links (#section) to work normally
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
};

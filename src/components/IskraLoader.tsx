// Branded loading screen with rotating witty copy.
// Used for route-level Suspense fallbacks and auth-check screens.
import { useEffect, useState } from "react";
import { IskraSparkMark } from "@/components/IskraLogo";

const MESSAGES = [
  "Soon your WhatsApp gonna be blasting.",
  "Warming up the spark…",
  "Polishing the pipeline…",
  "Loading replies that actually convert…",
  "Lining up your next signed deal…",
  "Brewing campaigns in the background…",
  "Iskra is loading. Patience pays.",
];

export const IskraLoader = ({
  fullscreen = true,
  message,
}: {
  fullscreen?: boolean;
  message?: string;
}) => {
  const [i, setI] = useState(() => Math.floor(Math.random() * MESSAGES.length));

  useEffect(() => {
    if (message) return;
    const id = setInterval(() => setI((n) => (n + 1) % MESSAGES.length), 2200);
    return () => clearInterval(id);
  }, [message]);

  return (
    <div
      className={`${
        fullscreen ? "min-h-screen" : "py-16"
      } w-full bg-background flex items-center justify-center px-6`}
      aria-busy="true"
      role="status"
    >
      <div className="flex flex-col items-center gap-5 text-center max-w-sm">
        <div className="relative">
          <span
            className="absolute inset-0 rounded-lg animate-ping bg-iskra-emerald/30"
            aria-hidden="true"
          />
          <IskraSparkMark size={56} className="relative animate-pulse" />
        </div>
        <p
          key={message ?? i}
          className="text-sm md:text-base text-muted-foreground font-medium animate-fade-in"
        >
          {message ?? MESSAGES[i]}
        </p>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
};

export default IskraLoader;

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const generateSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

async function trackEvent(data: {
  session_id: string;
  page_name: string;
  event_type: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.functions.invoke("submit-form", {
      body: {
        action: "track-analytics",
        session_id: data.session_id,
        form_type: `page:${data.page_name}`,
        step_number: 1,
        step_name: data.event_type,
        event_type: data.event_type,
        metadata: data.metadata,
      },
    });
  } catch (err) {
    // silent fail - analytics must not break UX
    console.warn("[pageAnalytics] track failed", err);
  }
}

interface Options {
  pageName: string;
  /** Send heartbeat every N seconds while tab is visible */
  heartbeatSeconds?: number;
}

/**
 * Tracks page-level engagement: page_view, scroll_depth (25/50/75/100),
 * link/button clicks (delegated), heartbeat (time on page), and final time_on_page on unload.
 */
export const usePageAnalytics = ({ pageName, heartbeatSeconds = 15 }: Options) => {
  const sessionId = useRef(generateSessionId());
  const startTime = useRef(Date.now());
  const visibleMs = useRef(0);
  const lastVisibleAt = useRef<number | null>(Date.now());
  const reachedDepths = useRef<Set<number>>(new Set());
  const sentRef = useRef(false);

  useEffect(() => {
    const sid = sessionId.current;

    // 1. page_view
    trackEvent({
      session_id: sid,
      page_name: pageName,
      event_type: "page_view",
      metadata: {
        url: window.location.href,
        referrer: document.referrer || null,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        user_agent: navigator.userAgent,
      },
    });

    // 2. scroll depth
    let scrollTimer: number | null = null;
    const onScroll = () => {
      if (scrollTimer) return;
      scrollTimer = window.setTimeout(() => {
        scrollTimer = null;
        const scrollTop = window.scrollY;
        const docHeight =
          document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return;
        const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));
        for (const milestone of [25, 50, 75, 100]) {
          if (pct >= milestone && !reachedDepths.current.has(milestone)) {
            reachedDepths.current.add(milestone);
            trackEvent({
              session_id: sid,
              page_name: pageName,
              event_type: "scroll_depth",
              metadata: { depth: milestone },
            });
          }
        }
      }, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. click delegation (links, buttons, [data-track])
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const el = target.closest<HTMLElement>(
        "a, button, [data-track]"
      );
      if (!el) return;
      const label =
        el.dataset.track ||
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 80) ||
        el.tagName.toLowerCase();
      const href =
        el.tagName === "A" ? (el as HTMLAnchorElement).href : null;
      trackEvent({
        session_id: sid,
        page_name: pageName,
        event_type: "click",
        metadata: { label, href, tag: el.tagName.toLowerCase() },
      });
    };
    document.addEventListener("click", onClick, { passive: true });

    // 4. visibility tracking for accurate time-on-page
    const onVisibility = () => {
      if (document.hidden) {
        if (lastVisibleAt.current) {
          visibleMs.current += Date.now() - lastVisibleAt.current;
          lastVisibleAt.current = null;
        }
      } else {
        lastVisibleAt.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 5. heartbeat
    const heartbeat = window.setInterval(() => {
      if (document.hidden) return;
      const totalSec = Math.round(
        (visibleMs.current +
          (lastVisibleAt.current ? Date.now() - lastVisibleAt.current : 0)) /
          1000
      );
      trackEvent({
        session_id: sid,
        page_name: pageName,
        event_type: "heartbeat",
        metadata: { seconds: totalSec },
      });
    }, heartbeatSeconds * 1000);

    // 6. final time_on_page on unload
    const sendFinal = () => {
      if (sentRef.current) return;
      sentRef.current = true;
      if (lastVisibleAt.current) {
        visibleMs.current += Date.now() - lastVisibleAt.current;
        lastVisibleAt.current = null;
      }
      const totalSec = Math.round(visibleMs.current / 1000);
      // fire-and-forget; can't await on unload
      trackEvent({
        session_id: sid,
        page_name: pageName,
        event_type: "time_on_page",
        metadata: {
          seconds: totalSec,
          max_scroll_depth: Math.max(0, ...Array.from(reachedDepths.current)),
        },
      });
    };
    window.addEventListener("pagehide", sendFinal);
    window.addEventListener("beforeunload", sendFinal);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendFinal);
      window.removeEventListener("beforeunload", sendFinal);
      window.clearInterval(heartbeat);
      sendFinal();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageName, heartbeatSeconds]);
};

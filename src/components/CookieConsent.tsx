import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

type ConsentState = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
};

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [consent, setConsent] = useState<ConsentState>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const saved = localStorage.getItem('iskra_cookie_consent');
    if (!saved) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const saveConsent = (c: ConsentState) => {
    localStorage.setItem('iskra_cookie_consent', JSON.stringify(c));
    window.dispatchEvent(new CustomEvent('cookie-consent-update', { detail: c }));
    setVisible(false);
  };

  const acceptAll = () => saveConsent({ necessary: true, analytics: true, marketing: true });
  const acceptSelected = () => saveConsent(consent);
  const rejectAll = () => saveConsent({ necessary: true, analytics: false, marketing: false });

  const accent = {
    green: 'hsl(152 55% 35%)',
    muted: 'hsl(0 0% 50%)',
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-[9999]"
          style={{
            background: 'hsl(0 0% 96%)',
            border: '1px solid hsl(0 0% 82%)',
            borderRadius: '1rem',
            boxShadow: '0 8px 40px hsl(0 0% 0% / 0.15)',
            padding: '1.25rem 1.5rem',
          }}
        >
          <p className="text-sm font-semibold mb-1 font-display" style={{ color: 'hsl(0 0% 10%)' }}>
            🍪 Cookie preferences
          </p>
          <p className="text-xs leading-relaxed mb-3" style={{ color: accent.muted }}>
            We use cookies to improve your experience and collect analytics.{' '}
            <Link to="/privacy" className="underline" style={{ color: accent.green }}>Learn more</Link>
          </p>

          {showDetails && (
            <div className="space-y-2 mb-3">
              {[
                { key: 'necessary' as const, label: 'Necessary', desc: 'Required for the site to work', disabled: true },
                { key: 'analytics' as const, label: 'Analytics', desc: 'Page views, clicks, scroll depth', disabled: false },
                { key: 'marketing' as const, label: 'Marketing', desc: 'UTM tracking, referrer data', disabled: false },
              ].map(cat => (
                <label key={cat.key} className="flex items-center gap-2.5 cursor-pointer">
                  <button
                    type="button"
                    disabled={cat.disabled}
                    onClick={() => !cat.disabled && setConsent(c => ({ ...c, [cat.key]: !c[cat.key] }))}
                    className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                    style={{
                      border: `1.5px solid ${consent[cat.key] ? accent.green : 'hsl(0 0% 72%)'}`,
                      background: consent[cat.key] ? accent.green : 'transparent',
                      opacity: cat.disabled ? 0.6 : 1,
                    }}
                  >
                    {consent[cat.key] && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <div>
                    <span className="text-xs font-semibold" style={{ color: 'hsl(0 0% 10%)' }}>{cat.label}</span>
                    <span className="text-xs ml-1.5" style={{ color: accent.muted }}> - {cat.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={acceptAll}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: accent.green, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Accept all
            </button>
            {showDetails ? (
              <button
                onClick={acceptSelected}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'hsl(0 0% 88%)', color: 'hsl(0 0% 10%)', border: '1px solid hsl(0 0% 78%)', cursor: 'pointer' }}
              >
                Save selection
              </button>
            ) : (
              <button
                onClick={() => setShowDetails(true)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'hsl(0 0% 88%)', color: 'hsl(0 0% 10%)', border: '1px solid hsl(0 0% 78%)', cursor: 'pointer' }}
              >
                Customize
              </button>
            )}
            <button
              onClick={rejectAll}
              className="py-2 px-3 rounded-lg text-xs font-semibold"
              style={{ background: 'transparent', color: accent.muted, border: 'none', cursor: 'pointer' }}
            >
              Reject
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;

// ISKRA brand tokens for emails. Body remains white per email best practices.
export const BRAND = {
  name: 'ISKRA',
  logoUrl: 'https://xglfamaaotmwulglwcui.supabase.co/storage/v1/object/public/email-assets/iskra-logo-wordmark.png',
  logoWidth: 150,
  logoHeight: 40,
  colors: {
    emerald: '#1f8f5e',         // hsl(152 65% 35%)
    emeraldDark: '#176a47',     // hsl(152 60% 25%)
    emeraldLight: '#23a36b',    // hsl(152 70% 42%)
    champagne: '#e9ddc6',       // hsl(36 34% 87%)
    champagneSoft: '#f5efe2',   // softer card surface
    ink: '#1f1812',             // hsl(28 22% 11%)
    muted: '#7a6a5a',           // hsl(28 18% 40%)
    hairline: '#e2d8c4',
    white: '#ffffff',
  },
  font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`,
} as const

export const styles = {
  main: {
    backgroundColor: '#ffffff',
    fontFamily: BRAND.font,
    margin: 0,
    padding: '40px 16px',
    color: BRAND.colors.ink,
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    backgroundColor: BRAND.colors.champagneSoft,
    borderRadius: '16px',
    border: `1px solid ${BRAND.colors.hairline}`,
    overflow: 'hidden',
  },
  header: {
    padding: '28px 32px 0',
    textAlign: 'left' as const,
  },
  logo: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    display: 'block',
  },
  body: {
    padding: '24px 32px 32px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: 600 as const,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: BRAND.colors.emerald,
    margin: '0 0 12px',
  },
  h1: {
    fontSize: '26px',
    fontWeight: 600 as const,
    color: BRAND.colors.ink,
    lineHeight: '1.25',
    letterSpacing: '-0.01em',
    margin: '0 0 16px',
  },
  text: {
    fontSize: '15px',
    color: BRAND.colors.ink,
    lineHeight: '1.6',
    margin: '0 0 20px',
  },
  muted: {
    fontSize: '13px',
    color: BRAND.colors.muted,
    lineHeight: '1.6',
    margin: '0',
  },
  buttonWrap: {
    margin: '8px 0 28px',
  },
  button: {
    backgroundColor: BRAND.colors.emerald,
    backgroundImage: `linear-gradient(135deg, ${BRAND.colors.emeraldLight} 0%, ${BRAND.colors.emerald} 100%)`,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600 as const,
    borderRadius: '10px',
    padding: '14px 26px',
    textDecoration: 'none',
    display: 'inline-block',
    border: 'none',
  },
  link: { color: BRAND.colors.emerald, textDecoration: 'none', fontWeight: 600 as const },
  hr: {
    border: 'none',
    borderTop: `1px solid ${BRAND.colors.hairline}`,
    margin: '24px 0',
  },
  code: {
    display: 'inline-block',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '28px',
    fontWeight: 700 as const,
    letterSpacing: '0.32em',
    color: BRAND.colors.ink,
    backgroundColor: '#ffffff',
    border: `1px solid ${BRAND.colors.hairline}`,
    borderRadius: '12px',
    padding: '14px 22px',
    margin: '0 0 24px',
  },
  footer: {
    padding: '20px 32px 28px',
    backgroundColor: '#ffffff',
    borderTop: `1px solid ${BRAND.colors.hairline}`,
    fontSize: '12px',
    color: BRAND.colors.muted,
    lineHeight: '1.6',
    textAlign: 'center' as const,
  },
}

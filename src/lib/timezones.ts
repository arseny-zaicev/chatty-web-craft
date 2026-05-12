// ISO country code -> primary IANA timezone + short human label.
// Mirrors the COUNTRY_TZ_LABEL map in supabase/functions/_shared/slackBlocks.ts
// (kept in sync manually — edge functions can't import from src/).

export const COUNTRY_TZ: Record<string, { tz: string; label: string }> = {
  US: { tz: "America/New_York", label: "New York" },
  CA: { tz: "America/Toronto", label: "Toronto" },
  GB: { tz: "Europe/London", label: "London" },
  UK: { tz: "Europe/London", label: "London" },
  AE: { tz: "Asia/Dubai", label: "UAE" },
  SA: { tz: "Asia/Riyadh", label: "Riyadh" },
  IN: { tz: "Asia/Kolkata", label: "India" },
  DE: { tz: "Europe/Berlin", label: "Berlin" },
  FR: { tz: "Europe/Paris", label: "Paris" },
  IT: { tz: "Europe/Rome", label: "Rome" },
  ES: { tz: "Europe/Madrid", label: "Madrid" },
  NL: { tz: "Europe/Amsterdam", label: "Amsterdam" },
  BR: { tz: "America/Sao_Paulo", label: "Brazil" },
  MX: { tz: "America/Mexico_City", label: "Mexico" },
  AU: { tz: "Australia/Sydney", label: "Sydney" },
  JP: { tz: "Asia/Tokyo", label: "Tokyo" },
  SG: { tz: "Asia/Singapore", label: "Singapore" },
  HK: { tz: "Asia/Hong_Kong", label: "Hong Kong" },
};

export function tzInfo(country: string | null | undefined): { tz: string; label: string } {
  const code = String(country || "").toUpperCase();
  return COUNTRY_TZ[code] || { tz: "UTC", label: "UTC" };
}

/** YYYY-MM-DD in the given timezone. */
export function dateKeyInTz(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "May 12" in the given timezone. */
export function shortDateInTz(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
}

/** "09:00" in the given timezone (24h). */
export function timeInTz(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function todayKeyInTz(tz: string): string {
  return dateKeyInTz(new Date(), tz);
}

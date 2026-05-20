// Time / phone-TZ / quota helpers extracted from campaigns/index.ts (stage 1 split).
// Behavior is byte-identical to the originals; only their location moved.

export const MAX_PER_NUMBER_QUOTA = 10000;
export const LEGACY_DEFAULT_DAILY_SEND_LIMIT = 200;

// Strips a phone string to digits only. Recipients reaching dispatch have
// already been normalized + CC-repaired upstream by `lead-intake` /
// `google-sheets-sync`. This helper only guarantees a clean digits-only
// contact_phone for inserts into campaign_recipients / conversations.
// Do NOT use this for raw lead intake.
export function stripToDigits(phone: string) {
  return String(phone || "").replace(/[^\d]/g, "");
}

export function randomDelay(min: number, max: number) {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function normalizePerNumberQuota(value: any, fallback = LEGACY_DEFAULT_DAILY_SEND_LIMIT) {
  return Math.max(1, Math.min(MAX_PER_NUMBER_QUOTA, Math.floor(Number(value ?? fallback))));
}

export function explicitDailySendLimit(value: any): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const limit = Math.max(1, Math.min(100000, Math.floor(raw)));
  // `daily_send_limit` was introduced as NOT NULL DEFAULT 200, so old rows
  // with 200 do not prove the operator set a real limit. Treat that legacy
  // default as unset: no hidden cap and no noisy warning.
  return limit === LEGACY_DEFAULT_DAILY_SEND_LIMIT ? null : limit;
}

// Map common phone country prefixes -> IANA timezone (rough, single TZ per country)
export const PHONE_TZ: Array<[string, string]> = [
  ["971", "Asia/Dubai"], ["972", "Asia/Jerusalem"], ["966", "Asia/Riyadh"], ["965", "Asia/Kuwait"],
  ["974", "Asia/Qatar"], ["973", "Asia/Bahrain"], ["968", "Asia/Muscat"], ["20", "Africa/Cairo"],
  ["44", "Europe/London"], ["353", "Europe/Dublin"], ["33", "Europe/Paris"], ["49", "Europe/Berlin"],
  ["34", "Europe/Madrid"], ["39", "Europe/Rome"], ["31", "Europe/Amsterdam"], ["351", "Europe/Lisbon"],
  ["41", "Europe/Zurich"], ["43", "Europe/Vienna"], ["46", "Europe/Stockholm"], ["47", "Europe/Oslo"],
  ["45", "Europe/Copenhagen"], ["358", "Europe/Helsinki"], ["48", "Europe/Warsaw"], ["420", "Europe/Prague"],
  ["7", "Europe/Moscow"], ["380", "Europe/Kyiv"],
  ["1", "America/New_York"], ["52", "America/Mexico_City"], ["55", "America/Sao_Paulo"], ["54", "America/Argentina/Buenos_Aires"],
  ["91", "Asia/Kolkata"], ["86", "Asia/Shanghai"], ["81", "Asia/Tokyo"], ["82", "Asia/Seoul"],
  ["65", "Asia/Singapore"], ["60", "Asia/Kuala_Lumpur"], ["62", "Asia/Jakarta"], ["63", "Asia/Manila"],
  ["66", "Asia/Bangkok"], ["84", "Asia/Ho_Chi_Minh"], ["61", "Australia/Sydney"], ["64", "Pacific/Auckland"],
  ["27", "Africa/Johannesburg"], ["234", "Africa/Lagos"], ["254", "Africa/Nairobi"], ["212", "Africa/Casablanca"],
];

// ISO country code -> primary IANA TZ (mirrors campaign-day-rollover.COUNTRY_TZ)
export const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York", CA: "America/Toronto", GB: "Europe/London", UK: "Europe/London",
  AE: "Asia/Dubai", SA: "Asia/Riyadh", IN: "Asia/Kolkata", DE: "Europe/Berlin",
  FR: "Europe/Paris", IT: "Europe/Rome", ES: "Europe/Madrid", NL: "Europe/Amsterdam",
  BR: "America/Sao_Paulo", MX: "America/Mexico_City", AU: "Australia/Sydney",
  JP: "Asia/Tokyo", SG: "Asia/Singapore", HK: "Asia/Hong_Kong",
};

export function tzFromPhone(phone: string): string {
  const d = String(phone || "").replace(/[^\d]/g, "");
  if (!d) return "UTC";
  const sorted = [...PHONE_TZ].sort((a, b) => b[0].length - a[0].length);
  for (const [pfx, tz] of sorted) if (d.startsWith(pfx)) return tz;
  return "UTC";
}

// Get UTC offset (minutes) for a given IANA tz at instant `at`. Approximate, good enough for windows.
export function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const parts = dtf.formatToParts(at);
    const map: any = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch { return 0; }
}

// Parse "HH:MM" to minutes
export function hhmmToMin(s: string): number {
  const [h, m] = String(s || "09:00").split(":").map((x) => parseInt(x, 10) || 0);
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m));
}

// Build a UTC Date for `dateStr (YYYY-MM-DD) at HH:MM in tz`.
export function dateAtTzToUTC(dateStr: string, hhmm: string, tz: string): Date {
  const [Y, M, D] = dateStr.split("-").map((x) => parseInt(x, 10));
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
  // Treat the wall clock as UTC, then offset
  const naiveUtc = Date.UTC(Y, (M || 1) - 1, D || 1, h || 0, m || 0, 0);
  const offset = tzOffsetMinutes(tz, new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60_000);
}

// Poisson inter-arrival sampler with given rate (events per second). Returns seconds gap.
export function exponentialGap(ratePerSec: number): number {
  if (ratePerSec <= 0) return 0;
  const u = Math.max(1e-9, Math.random());
  return -Math.log(u) / ratePerSec;
}

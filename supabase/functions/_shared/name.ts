// Shared name normalizers.
//
// Two complementary helpers:
//   normalizeName(raw)        -> { full, first }  — used at import + dispatch
//   normalizeFirstName(raw)   -> { value, raw, outcome }  — legacy strict
//                                first-name validator used by google-sheets-sync
//                                and lead-intake.
//
//   "GERALD  gautsch 🔥"          -> { full: "Gerald Gautsch", first: "Gerald" }
//   "  maria-jose (IG Coach)  "    -> { full: "Maria-Jose",     first: "Maria-Jose" }
//   "p: +49..."                    -> { full: "",               first: "" }
//   null                           -> { full: "",               first: "" }

export interface NormalizedName {
  full: string;
  first: string;
}

const TRAILING_JUNK_RX = /\s*(?:[-–—]\s*\S.*|\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|from\s+\w+.*)$/i;

const EMOJI_AND_SYMBOL_RX =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{2700}-\u{27BF}★☆♥♡→←↑↓✓✔✗✘]/gu;

const PHONE_ISH_RX = /\b(?:tel|phone|wa|whatsapp|p)\s*[:：]/i;

function toTitleCase(s: string): string {
  return s
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-") return part;
      if (!part) return part;
      const lower = part.toLocaleLowerCase();
      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join("");
}

export function normalizeName(raw: unknown): NormalizedName {
  if (raw == null) return { full: "", first: "" };
  let s = String(raw);

  if (PHONE_ISH_RX.test(s)) return { full: "", first: "" };

  s = s.replace(EMOJI_AND_SYMBOL_RX, " ");
  s = s.replace(/[_*~`|]/g, " ");
  let prev: string;
  do {
    prev = s;
    s = s.replace(TRAILING_JUNK_RX, "");
  } while (s !== prev);
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return { full: "", first: "" };

  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return { full: "", first: "" };

  const isAllUpper = s === s.toLocaleUpperCase();
  const isAllLower = s === s.toLocaleLowerCase();
  const formatted = (isAllUpper || isAllLower) ? toTitleCase(s) : s;

  const first = formatted.split(/\s+/)[0] || "";
  return { full: formatted, first };
}

// ---------------------------------------------------------------------------
// Legacy strict first-name validator (kept for lead-intake / sheets-sync).
// Returns null when the value doesn't look like a real first name so the
// template falls back to the neutral greeting.
// ---------------------------------------------------------------------------

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
const COMBINING = /[\u0300-\u036f\uFE00-\uFE0F]/g;
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

const BANNED = new Set<string>([
  "gmbh", "ug", "kg", "ag", "ltd", "llc", "inc", "co", "company",
  "team", "info", "admin", "test", "support", "office", "sales", "hello",
  "kein", "keine", "none", "null", "xxx", "anonymous", "anon", "unknown",
  "no", "n/a", "na", "nan", "tbd",
]);

export type FirstNameResult = {
  value: string | null;
  raw: string | null;
  outcome: "ok" | "empty" | "unusable";
};

function titleCaseStrict(s: string): string {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/([\-'])/)
    .map((part) => (part === "-" || part === "'") ? part : (part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

export function normalizeFirstName(rawInput: unknown): FirstNameResult {
  if (rawInput == null) return { value: null, raw: null, outcome: "empty" };
  const rawStr = String(rawInput);
  if (!rawStr.trim()) return { value: null, raw: rawStr, outcome: "empty" };

  let s = rawStr.normalize("NFKD").replace(COMBINING, "");
  s = s.replace(ZERO_WIDTH, "").replace(EMOJI, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return { value: null, raw: rawStr, outcome: "unusable" };

  const first = s.split(/[\s,;/|]+/)[0] ?? "";
  const stripped = first.replace(/[^\p{L}\-']+$/u, "").replace(/^[^\p{L}]+/u, "");
  if (!stripped) return { value: null, raw: rawStr, outcome: "unusable" };

  const lower = stripped.toLowerCase();
  if (/\d/.test(stripped)) return { value: null, raw: rawStr, outcome: "unusable" };
  if (stripped.length < 2) return { value: null, raw: rawStr, outcome: "unusable" };
  if (BANNED.has(lower)) return { value: null, raw: rawStr, outcome: "unusable" };
  if (stripped === lower && stripped.length <= 4 && !/[A-ZÀ-ÖØ-Þ]/.test(rawStr)) {
    return { value: null, raw: rawStr, outcome: "unusable" };
  }
  if (!/[a-z]/i.test(stripped)) return { value: null, raw: rawStr, outcome: "unusable" };

  return { value: titleCaseStrict(stripped).slice(0, 80), raw: rawStr, outcome: "ok" };
}

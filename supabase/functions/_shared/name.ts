// Shared first-name normalization for lead imports.
//
// Goal: convert messy Google-Sheet name cells into a clean first name we can
// safely interpolate into a WhatsApp template. Anything that doesn't look like
// a real first name returns `value: null` so the template's first-name var
// falls back to the neutral greeting instead of saying "Hi memo" or
// "Hi 𝓙𝓮𝓼𝓼𝓲".
//
// Deterministic. No AI. Same input → same output.

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
// Stripped after NFKD: combining marks, variation selectors.
const COMBINING = /[\u0300-\u036f\uFE00-\uFE0F]/g;
// Emoji + pictographs + symbols (covers most ranges).
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

// Tokens that are clearly not first names. Lowercase, exact match after
// stripping punctuation. Extend freely.
const BANNED = new Set<string>([
  "gmbh", "ug", "kg", "ag", "ltd", "llc", "inc", "co", "company",
  "team", "info", "admin", "test", "support", "office", "sales", "hello",
  "kein", "keine", "none", "null", "xxx", "anonymous", "anon", "unknown",
  "no", "n/a", "na", "nan", "tbd",
]);

export type FirstNameResult = {
  value: string | null;             // clean first name, Title-Case, or null
  raw: string | null;               // original cell value as received
  outcome: "ok" | "empty" | "unusable";
};

function titleCase(s: string): string {
  if (!s) return s;
  // Handle hyphenated / apostrophed names: Anne-Marie, O'Brien.
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

  // 1. NFKD-normalise → maps mathematical-script / fullwidth / bold / fraktur
  //    variants of Latin letters back to plain Latin. Then strip combining
  //    marks left behind by NFKD (accents) so "halıl" / "𝔥𝔞𝔩𝔦𝔩" both become
  //    "halil".
  let s = rawStr.normalize("NFKD").replace(COMBINING, "");
  s = s.replace(ZERO_WIDTH, "").replace(EMOJI, "");
  // Collapse whitespace and trim.
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return { value: null, raw: rawStr, outcome: "unusable" };

  // 2. First token only. Splits on whitespace AND common separators like
  //    "Kevin / Bo", "Kevin, Bo".
  const first = s.split(/[\s,;/|]+/)[0] ?? "";
  // Strip trailing punctuation (Kevin. → Kevin).
  const stripped = first.replace(/[^\p{L}\-']+$/u, "").replace(/^[^\p{L}]+/u, "");
  if (!stripped) return { value: null, raw: rawStr, outcome: "unusable" };

  // 3. Reject obvious non-names.
  const lower = stripped.toLowerCase();
  if (/\d/.test(stripped)) return { value: null, raw: rawStr, outcome: "unusable" };
  if (stripped.length < 2) return { value: null, raw: rawStr, outcome: "unusable" };
  if (BANNED.has(lower)) return { value: null, raw: rawStr, outcome: "unusable" };
  // Single dictionary-y lowercase token of length <=4 with no original
  // uppercase letter anywhere → likely a placeholder like "memo".
  if (stripped === lower && stripped.length <= 4 && !/[A-ZÀ-ÖØ-Þ]/.test(rawStr)) {
    return { value: null, raw: rawStr, outcome: "unusable" };
  }
  // Must contain at least one Latin letter after all the cleanup.
  if (!/[a-z]/i.test(stripped)) return { value: null, raw: rawStr, outcome: "unusable" };

  return { value: titleCase(stripped).slice(0, 80), raw: rawStr, outcome: "ok" };
}

// Shared name normalizer.
//
// Cleans messy contact names from Sheets/CSV imports so they're safe to drop
// into `{{name}}` template variables and look human.
//
//   "GERALD  gautsch 🔥"          -> { full: "Gerald Gautsch", first: "Gerald" }
//   "  maria-jose (IG Coach)  "    -> { full: "Maria-Jose",     first: "Maria-Jose" }
//   "p: +49..."                    -> { full: "",               first: "" }
//   null                           -> { full: "",               first: "" }

export interface NormalizedName {
  full: string;
  first: string;
}

// Trailing junk we routinely see in Sheets: parens, dashes followed by labels.
const TRAILING_JUNK_RX = /\s*(?:[-–—]\s*\S.*|\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|from\s+\w+.*)$/i;

// Emoji + most symbols. Keep letters (incl. accented), digits, spaces, hyphens, apostrophes.
const EMOJI_AND_SYMBOL_RX =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}★☆♥♡→←↑↓✓✔✗✘]/gu;

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

  // If the "name" field actually looks like a phone marker, treat as empty.
  if (PHONE_ISH_RX.test(s)) return { full: "", first: "" };

  s = s.replace(EMOJI_AND_SYMBOL_RX, " ");
  s = s.replace(/[_*~`|]/g, " ");
  // Strip trailing junk like " - Coach", " (IG)", " from Berlin"
  let prev: string;
  do {
    prev = s;
    s = s.replace(TRAILING_JUNK_RX, "");
  } while (s !== prev);
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return { full: "", first: "" };

  // Heuristic: looks mostly numeric -> not a name.
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return { full: "", first: "" };

  // Title-case if value is all-upper or all-lower (preserve mixed like "McDonald").
  const isAllUpper = s === s.toLocaleUpperCase();
  const isAllLower = s === s.toLocaleLowerCase();
  const formatted = (isAllUpper || isAllLower) ? toTitleCase(s) : s;

  const first = formatted.split(/\s+/)[0] || "";
  return { full: formatted, first };
}

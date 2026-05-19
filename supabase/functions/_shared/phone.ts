// Shared phone normalizer.
//
// Canonical storage format: digits-only E.164 (no leading '+'), 8-15 digits.
//
// Result statuses:
//   ok           - normalized successfully (digits in `phone`)
//   empty        - input was empty/null
//   test_lead    - Meta "<test lead>" placeholder
//   invalid      - definitely not a phone number (no digits, junk)
//   needs_review - looks like a phone but operator must verify (ambiguous CC)
//
// `expectedCountryCodes` is a list of dial codes (e.g. ["49","43","41"])
// configured on the pipeline. They're tried in order and used to fix:
//   - bare local numbers ("17612345..." -> "4917612345...")
//   - trunk-zero numbers ("017612345..." -> "4917612345...")

export type PhoneResult =
  | { ok: true; phone: string; raw: string; matched_cc?: string }
  | {
      ok: false;
      status: "empty" | "test_lead" | "invalid" | "needs_review";
      raw: string;
      reason: string;
      cleaned?: string;
    };

const TEST_LEAD_RX = /<\s*test\s+lead/i;
const PREFIX_RX = /^\s*(p|P|П|tel|phone|whatsapp|wa)\s*[:：]\s*/i;

// Known country dial codes (sorted by length, longest first for prefix-match).
// Not exhaustive - just the ones we actually serve + common cases so we can
// recognize "already international" inputs without an explicit '+'.
const KNOWN_CCS = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41",
  "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56",
  "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86",
  "90", "91", "92", "93", "94", "95", "98", "211", "212", "213", "216", "218",
  "220", "221", "222", "223", "224", "225", "226", "227", "228", "229", "230",
  "231", "232", "233", "234", "235", "236", "237", "238", "239", "240", "241",
  "242", "243", "244", "245", "248", "249", "250", "251", "252", "253", "254",
  "255", "256", "257", "258", "260", "261", "262", "263", "264", "265", "266",
  "267", "268", "269", "297", "298", "299", "350", "351", "352", "353", "354",
  "355", "356", "357", "358", "359", "370", "371", "372", "373", "374", "375",
  "376", "377", "378", "380", "381", "382", "383", "385", "386", "387", "389",
  "420", "421", "423", "500", "501", "502", "503", "504", "505", "506", "507",
  "591", "592", "593", "594", "595", "596", "597", "598", "599", "670", "672",
  "673", "674", "675", "676", "677", "678", "679", "680", "681", "682", "683",
  "685", "686", "687", "688", "689", "690", "691", "692", "850", "852", "853",
  "855", "856", "880", "886", "960", "961", "962", "963", "964", "965", "966",
  "967", "968", "970", "971", "972", "973", "974", "975", "976", "977", "992",
  "993", "994", "995", "996", "998",
].sort((a, b) => b.length - a.length);

// Plausible national-number length (digits AFTER the CC) per country.
// Used to disambiguate when multiple CCs are configured for a pipeline.
const NATIONAL_LEN: Record<string, { min: number; max: number }> = {
  "49": { min: 10, max: 11 }, // Germany mobile/landline
  "43": { min: 10, max: 13 }, // Austria
  "41": { min: 9,  max: 10 }, // Switzerland
  "44": { min: 9,  max: 10 }, // UK
  "33": { min: 9,  max: 9  }, // France
  "39": { min: 8,  max: 11 }, // Italy
  "34": { min: 9,  max: 9  }, // Spain
  "31": { min: 9,  max: 9  }, // Netherlands
  "32": { min: 8,  max: 9  }, // Belgium
  "46": { min: 7,  max: 13 }, // Sweden
  "47": { min: 8,  max: 8  }, // Norway
  "45": { min: 8,  max: 8  }, // Denmark
  "1":  { min: 10, max: 10 }, // NANP
  "971":{ min: 8,  max: 9  }, // UAE
  "65": { min: 8,  max: 8  }, // Singapore
  "66": { min: 9,  max: 10 }, // Thailand
  "61": { min: 9,  max: 9  }, // Australia
  "351":{ min: 9,  max: 9  }, // Portugal
};

function fitsNational(cc: string, nationalDigits: string): boolean {
  const rules = NATIONAL_LEN[cc];
  if (!rules) return nationalDigits.length >= 6 && nationalDigits.length <= 13;
  return nationalDigits.length >= rules.min && nationalDigits.length <= rules.max;
}

function normalizeCCList(input?: string | string[] | null): string[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr
    .map((s) => String(s || "").replace(/\D/g, ""))
    .filter((s) => s.length > 0 && s.length <= 4);
}

export function normalizePhone(
  raw: unknown,
  defaultCountryCodes?: string | string[] | null,
): PhoneResult {
  const rawStr = raw == null ? "" : String(raw);
  const trimmed = rawStr.trim();
  if (!trimmed) return { ok: false, status: "empty", raw: rawStr, reason: "empty" };
  if (TEST_LEAD_RX.test(trimmed)) {
    return { ok: false, status: "test_lead", raw: rawStr, reason: "Meta test-lead placeholder" };
  }
  const stripped = trimmed.replace(PREFIX_RX, "");
  const cleaned = stripped.replace(/[^\d+]/g, "");
  if (!cleaned) return { ok: false, status: "invalid", raw: rawStr, reason: "no digits" };

  const hasPlus = cleaned.startsWith("+");
  let digits = hasPlus ? cleaned.slice(1) : cleaned;
  let treatAsInternational = hasPlus;
  if (!hasPlus && digits.startsWith("00") && digits.length >= 10) {
    digits = digits.slice(2);
    treatAsInternational = true;
  }
  digits = digits.replace(/\+/g, "");
  if (!/^\d+$/.test(digits)) {
    return { ok: false, status: "invalid", raw: rawStr, reason: "non-digit chars" };
  }

  const ccList = normalizeCCList(defaultCountryCodes);

  // 1) Explicit international (`+` or `00`) -> validate length and done.
  if (treatAsInternational) {
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, status: "invalid", raw: rawStr, reason: `length ${digits.length}`, cleaned: digits };
    }
    const matched = KNOWN_CCS.find((cc) => digits.startsWith(cc));
    return { ok: true, phone: digits, raw: rawStr, matched_cc: matched };
  }

  // 2) Already starts with one of the pipeline's expected CCs?
  const expectedMatch = ccList.find((cc) => digits.startsWith(cc) && fitsNational(cc, digits.slice(cc.length)));
  if (expectedMatch && digits.length >= 8 && digits.length <= 15) {
    return { ok: true, phone: digits, raw: rawStr, matched_cc: expectedMatch };
  }

  // 3) Starts with leading zero (trunk prefix) -> try each expected CC.
  if (digits.startsWith("0") && ccList.length > 0) {
    const national = digits.replace(/^0+/, "");
    const candidates = ccList.filter((cc) => fitsNational(cc, national));
    if (candidates.length === 1) {
      const out = candidates[0] + national;
      if (out.length >= 8 && out.length <= 15) {
        return { ok: true, phone: out, raw: rawStr, matched_cc: candidates[0] };
      }
    }
    if (candidates.length === 0 && ccList.length === 1) {
      // Length doesn't fit known rules but there's only one CC - try anyway.
      const out = ccList[0] + national;
      if (out.length >= 8 && out.length <= 15) {
        return { ok: true, phone: out, raw: rawStr, matched_cc: ccList[0] };
      }
    }
    return {
      ok: false,
      status: "needs_review",
      raw: rawStr,
      reason: `trunk-zero number, ${candidates.length === 0 ? "no" : "multiple"} CC candidates`,
      cleaned: digits,
    };
  }

  // 4) Bare local-length number + single expected CC -> prepend.
  if (ccList.length === 1 && digits.length >= 6 && digits.length <= 11) {
    const cc = ccList[0];
    if (fitsNational(cc, digits) || NATIONAL_LEN[cc] === undefined) {
      const out = cc + digits;
      if (out.length >= 8 && out.length <= 15) {
        return { ok: true, phone: out, raw: rawStr, matched_cc: cc };
      }
    }
  }

  // 5) Bare local-length + multiple CCs -> needs review (don't guess).
  if (ccList.length > 1 && digits.length >= 6 && digits.length <= 11) {
    const candidates = ccList.filter((cc) => fitsNational(cc, digits));
    if (candidates.length === 1) {
      const out = candidates[0] + digits;
      return { ok: true, phone: out, raw: rawStr, matched_cc: candidates[0] };
    }
    return {
      ok: false,
      status: "needs_review",
      raw: rawStr,
      reason: "local-length number, multiple CC candidates",
      cleaned: digits,
    };
  }

  // 6) No CCs configured at all + ambiguous local -> needs review.
  if (ccList.length === 0 && digits.length >= 6 && digits.length <= 10) {
    return {
      ok: false,
      status: "needs_review",
      raw: rawStr,
      reason: "no country codes configured for pipeline",
      cleaned: digits,
    };
  }

  // 7) Final fallback: looks international-ish by length, check known CCs.
  if (digits.length >= 8 && digits.length <= 15) {
    const matched = KNOWN_CCS.find((cc) => digits.startsWith(cc));
    if (matched) {
      return { ok: true, phone: digits, raw: rawStr, matched_cc: matched };
    }
    return {
      ok: false,
      status: "needs_review",
      raw: rawStr,
      reason: "unrecognized country prefix",
      cleaned: digits,
    };
  }

  return {
    ok: false,
    status: "invalid",
    raw: rawStr,
    reason: `length ${digits.length}`,
    cleaned: digits,
  };
}

export function displayPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
}

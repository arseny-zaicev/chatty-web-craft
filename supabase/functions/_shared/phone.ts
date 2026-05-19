// Shared phone normalizer.
//
// Canonical storage format across the project: digits-only E.164 (no leading
// '+'), 8-15 digits. Display layer is responsible for adding the '+' prefix.
//
// Returns a discriminated result so callers can route by outcome:
//   { ok: true,  phone, raw }
//   { ok: false, status: 'empty' | 'test_lead' | 'invalid' | 'ambiguous',
//                raw, reason }
//
// `ambiguous` means: the value is plausibly a local number (7-10 digits with
// no leading '+' or country prefix) but no `defaultCountryCode` was supplied,
// so we refuse to silently guess. The operator must set the source's
// default_country_code or fix the row before this lead can be sent to.

export type PhoneResult =
  | { ok: true; phone: string; raw: string }
  | { ok: false; status: "empty" | "test_lead" | "invalid" | "ambiguous"; raw: string; reason: string };

const TEST_LEAD_RX = /<\s*test\s+lead/i;
const PREFIX_RX = /^\s*(p|P|П|tel|phone|whatsapp|wa)\s*[:：]\s*/i;

export function normalizePhone(
  raw: unknown,
  defaultCountryCode?: string | null,
): PhoneResult {
  const rawStr = raw == null ? "" : String(raw);
  const trimmed = rawStr.trim();
  if (!trimmed) return { ok: false, status: "empty", raw: rawStr, reason: "empty" };
  if (TEST_LEAD_RX.test(trimmed)) {
    return { ok: false, status: "test_lead", raw: rawStr, reason: "Meta test-lead placeholder" };
  }
  const stripped = trimmed.replace(PREFIX_RX, "");
  // Keep digits and a single leading '+' to detect explicit international form.
  const cleaned = stripped.replace(/[^\d+]/g, "");
  if (!cleaned) return { ok: false, status: "invalid", raw: rawStr, reason: "no digits" };
  const hasPlus = cleaned.startsWith("+");
  let digits = hasPlus ? cleaned.slice(1) : cleaned;
  // Drop any further '+' characters that appeared mid-string (typos).
  digits = digits.replace(/\+/g, "");
  if (!/^\d+$/.test(digits)) return { ok: false, status: "invalid", raw: rawStr, reason: "non-digit chars" };

  const cc = (defaultCountryCode || "").replace(/\D/g, "");

  // Trunk-zero handling: a leading '0' is a national trunk prefix in many
  // countries (DE, AT, FR, UK, ...). If we have a defaultCountryCode and the
  // user did NOT write an explicit '+', strip the leading 0 and prepend cc.
  if (!hasPlus && cc && digits.startsWith("0")) {
    const national = digits.replace(/^0+/, "");
    if (national.length >= 6 && national.length <= 12) {
      digits = cc + national;
    }
  } else if (!hasPlus && cc && !digits.startsWith(cc) && digits.length >= 7 && digits.length <= 10) {
    // Looks like a bare local mobile (7-10 digits) and a default CC is set.
    digits = cc + digits;
  } else if (!hasPlus && !cc && digits.length >= 7 && digits.length <= 10) {
    // Bare local-length number with no default CC available -> ambiguous.
    return {
      ok: false,
      status: "ambiguous",
      raw: rawStr,
      reason: "local-length number without default country code",
    };
  }

  // E.164 max is 15 digits; allow >=8 (shortest plausible international).
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, status: "invalid", raw: rawStr, reason: `length ${digits.length}` };
  }

  return { ok: true, phone: digits, raw: rawStr };
}

// Convenience: display form for UI ("+<digits>"). Storage stays digits-only.
export function displayPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
}

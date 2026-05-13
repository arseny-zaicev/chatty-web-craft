// Shared branding for partner / manager payout PDFs.
// Colors mirror the Iskra Craft-Champagne / Emerald palette in src/index.css.
// jsPDF uses RGB tuples, not HSL.

export const BRAND = {
  // Header band (champagne)
  champagne: [232, 223, 200] as [number, number, number],
  // Card/total box fill (cream)
  cream: [251, 249, 242] as [number, number, number],
  // Iskra emerald (primary brand)
  emerald: [31, 150, 103] as [number, number, number],
  emeraldDark: [25, 107, 77] as [number, number, number],
  // Body text
  ink: [34, 26, 18] as [number, number, number],
  inkSoft: [110, 95, 75] as [number, number, number],
  rule: [205, 192, 165] as [number, number, number],
};

export const BRAND_COPY = {
  product: "Iskra - WhatsApp Outreach",
  partnerSubtitle: "Partner statement",
  managerSubtitle: "Manager statement (you + your team)",
  contactLine: "Questions about this statement? reply@iskra.ae",
  earningsBasis: "Earnings are paid per confirmed delivery (not per attempt).",
};

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Pretty date for partner-facing PDFs - "12 May 2026", in Dubai (GST = UTC+4) so day boundaries match the ops timezone.
export function fmtDateDxb(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input.length <= 10 ? `${input}T00:00:00Z` : input) : input;
  const dxb = new Date(d.getTime() + 4 * 60 * 60 * 1000);
  return `${dxb.getUTCDate()} ${MONTH[dxb.getUTCMonth()]} ${dxb.getUTCFullYear()}`;
}

export function fmtDateRangeDxb(from: string, to: string): string {
  return `${fmtDateDxb(from)} - ${fmtDateDxb(to)}`;
}

// Money totals: 2 decimals, currency prefix.
export function fmtUsd(n: number): string {
  return `$${(Math.round(n * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Per-delivered rates: 4 decimals so 0.005 doesn't round to 0.01.
export function fmtRate(n: number): string {
  return `$${Number(n || 0).toFixed(4)}`;
}

// Spell out a small money rate for partner PDFs - e.g. 0.005 -> "zero point zero zero five US dollars"
export function spellOutRate(n: number): string {
  const s = Number(n || 0).toFixed(4);
  const map: Record<string, string> = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  };
  const [whole, frac] = s.split(".");
  const wholeWords = whole.split("").map(c => map[c] ?? c).join(" ");
  const fracWords = (frac ?? "").split("").map(c => map[c] ?? c).join(" ");
  return `${wholeWords} point ${fracWords} US dollars`.trim();
}

// Draw the branded header band onto the current page.
// Returns the y position right below the band so the caller can keep building.
// deno-lint-ignore no-explicit-any
export function drawHeader(doc: any, opts: { title: string; subtitle?: string }) {
  const W = doc.internal.pageSize.getWidth();
  const bandH = 96;
  doc.setFillColor(...BRAND.champagne);
  doc.rect(0, 0, W, bandH, "F");

  // Emerald accent rule under the band
  doc.setFillColor(...BRAND.emerald);
  doc.rect(0, bandH, W, 4, "F");

  // Wordmark
  doc.setTextColor(...BRAND.emeraldDark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Iskra", 40, 48);

  // Product line
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(BRAND_COPY.product, 40, 66);

  // Title block on the right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.emeraldDark);
  const tw = doc.getTextWidth(opts.title);
  doc.text(opts.title, W - 40 - tw, 48);
  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.inkSoft);
    const sw = doc.getTextWidth(opts.subtitle);
    doc.text(opts.subtitle, W - 40 - sw, 64);
  }

  return bandH + 28; // y for next content
}

// Footer with page numbers + contact. Call after all content is drawn.
// deno-lint-ignore no-explicit-any
export function drawFooter(doc: any, extraLine?: string) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.emerald);
    doc.setLineWidth(1);
    doc.line(40, H - 50, W - 40, H - 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.inkSoft);
    doc.text(BRAND_COPY.contactLine, 40, H - 36);
    if (extraLine) {
      doc.text(extraLine, 40, H - 24);
    }
    doc.text(`${i} / ${pageCount}`, W - 40 - doc.getTextWidth(`${i} / ${pageCount}`), H - 24);
  }
}

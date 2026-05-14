// Helpers for "Provided by / Ref / Own" attribution on whatsapp_numbers.
// A number is considered "Own" (no referral) when assigned_ref is empty
// and provided_by is empty or equals the SELF sentinel.

export const SELF_PROVIDER = "Self";

export type NumberAttributionInput = {
  provided_by?: string | null;
  assigned_ref?: string | null;
};

export type NumberAttribution =
  | { kind: "own" }
  | { kind: "referred"; ref: string; providedBy: string | null };

export function getAttribution(n: NumberAttributionInput): NumberAttribution {
  const ref = (n.assigned_ref ?? "").trim();
  const provided = (n.provided_by ?? "").trim();
  if (!ref && (!provided || provided.toLowerCase() === SELF_PROVIDER.toLowerCase())) {
    return { kind: "own" };
  }
  if (ref) {
    return { kind: "referred", ref, providedBy: provided || null };
  }
  // Has provided_by but no ref and not "Self" — treat as own provider attribution.
  return { kind: "referred", ref: provided, providedBy: null };
}

export function attributionLabel(n: NumberAttributionInput): string {
  const a = getAttribution(n);
  if (a.kind === "own") return "Own";
  return a.providedBy ? `Ref: ${a.ref} · via ${a.providedBy}` : `Ref: ${a.ref}`;
}

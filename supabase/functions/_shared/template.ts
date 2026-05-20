// Single source of truth for WhatsApp template variable substitution.
//
// Used by:
//   - supabase/functions/campaigns/index.ts (sendTemplate -> Gupshup params, inbox body)
//   - src/lib/launchData.ts (wizard preview)
//
// Why this exists: in Nov 2025 a campaign of 600 recipients failed 599/600 with
// WhatsApp error #131008 because the wizard preview used a "there" fallback for
// empty {{1}} but the Gupshup `params[]` array shipped an empty string. Two
// implementations -> drift -> outage. Never again. Both call sites MUST use
// these helpers.

export type TemplateLike = {
  body?: string | null;
  variables?: unknown;
};

/** Resolve one variable to the value WhatsApp / Gupshup will accept. */
export function resolveTemplateVar(
  name: string,
  index: number,
  raw: unknown,
): string {
  const v = String(raw ?? "").trim();
  if (v) return v;
  // Index 0 is conventionally the recipient name. Friendly fallback.
  if (index === 0) return "there";
  // Other empty params: WhatsApp rejects "" with #131008. Single space passes
  // validation while keeping the rendered body visually empty.
  return " ";
}

function templateHasLiteralThereBeforeFirstPlaceholder(body: string | null | undefined): boolean {
  return /\bthere\s*\{\{\s*1\s*\}\}/i.test(String(body ?? ""));
}

function resolveTemplateVarForBody(
  template: TemplateLike,
  name: string,
  index: number,
  raw: unknown,
): string {
  const v = String(raw ?? "").trim();
  if (v) return v;
  // If the template already says "Hey there {{1}}", do NOT fall back to
  // "there" again. A single-space param keeps WhatsApp/Gupshup happy and
  // renders as "Hey there" instead of "Hey there there".
  if (index === 0 && templateHasLiteralThereBeforeFirstPlaceholder(template.body)) return " ";
  return resolveTemplateVar(name, index, raw);
}

/** Build the params[] array sent to Gupshup. Order matches template.variables. */
export function buildTemplateParams(
  template: TemplateLike,
  values: Record<string, unknown> | null | undefined,
): string[] {
  const variableNames = Array.isArray(template.variables)
    ? (template.variables as string[])
    : [];
  return variableNames.map((key, idx) =>
    resolveTemplateVarForBody(template, key, idx, (values ?? {})[key]),
  );
}

/** Render the human-readable template body using the same fallback logic. */
export function renderTemplateBody(
  body: string | null | undefined,
  variableNames: string[],
  values: Record<string, unknown> | null | undefined,
): string {
  if (!body) return "";
  let out = String(body);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  variableNames.forEach((name, idx) => {
    const v = resolveTemplateVarForBody({ body }, name, idx, (values ?? {})[name]);
    // For inbox display, " " (param fallback) renders as nothing.
    const displayed = v === " " ? "" : v;
    const patterns = [`{{${idx + 1}}}`, `{${name}}`, `{{${name}}}`];
    for (const pat of patterns) {
      if (displayed === "") {
        // Strip placeholder + one adjacent space on either side so
        // "Hey there {{1}}, Elena" -> "Hey there, Elena" (not "Hey there , Elena").
        out = out.replace(new RegExp(`[ \\t]?${escape(pat)}[ \\t]?`, "g"), "");
      } else {
        out = out.replace(new RegExp(escape(pat), "g"), displayed);
      }
    }
  });
  return out;
}

/**
 * Validate template/recipient pair before launch. Throws with a clear,
 * operator-readable message; caller should surface as a 400.
 */
export function validateTemplateForLaunch(
  template: TemplateLike & { name?: string },
  recipients: Array<{ variables?: Record<string, unknown> | null }>,
): { warnings: string[] } {
  const variableNames = Array.isArray(template.variables)
    ? (template.variables as string[])
    : [];
  const body = String(template.body ?? "");

  // 1. Placeholder count must match template.variables count.
  const placeholderMatches = body.match(/\{\{\s*\d+\s*\}\}/g) ?? [];
  const placeholderIndices = new Set(
    placeholderMatches.map((m) => Number(m.replace(/[^\d]/g, ""))),
  );
  const maxPlaceholder = placeholderIndices.size
    ? Math.max(...placeholderIndices)
    : 0;
  if (variableNames.length > 0 && maxPlaceholder !== variableNames.length) {
    throw new Error(
      `Template "${template.name ?? "?"}" declares ${variableNames.length} variable(s) but body has placeholders up to {{${maxPlaceholder}}}. Fix the template before launching.`,
    );
  }

  // 1b. "Hey there {{1}}" is safe: params now send a single-space fallback
  // for empty {{1}}, so nameless rows render as "Hey there" rather than
  // "Hey there there". Count empties below only for operator warnings.
  const hasLiteralThereBeforeFirstPlaceholder =
    variableNames.length > 0 && templateHasLiteralThereBeforeFirstPlaceholder(body);

  if (recipients.length === 0 || variableNames.length === 0) {
    return { warnings: [] };
  }

  // 2. Count empties per variable index.
  const emptyByIdx: number[] = variableNames.map(() => 0);
  for (const r of recipients) {
    variableNames.forEach((name, idx) => {
      const raw = String((r.variables ?? {})[name] ?? "").trim();
      if (!raw) emptyByIdx[idx] += 1;
    });
  }

  const total = recipients.length;
  const warnings: string[] = [];

  if (hasLiteralThereBeforeFirstPlaceholder && emptyByIdx[0] > 0) {
    warnings.push(
      `${emptyByIdx[0]} of ${total} recipients have no name. Template "${template.name ?? "?"}" already contains "there {{1}}", so those rows will render as "Hey there".`,
    );
  }

  // 3. Hard fail: any non-name variable empty in >5% of recipients.
  for (let i = 1; i < variableNames.length; i++) {
    const pct = (emptyByIdx[i] / total) * 100;
    if (pct > 5) {
      throw new Error(
        `${emptyByIdx[i]} of ${total} recipients (${pct.toFixed(1)}%) have an empty value for variable {{${i + 1}}} ("${variableNames[i]}"). WhatsApp will reject these. Fix your data before launching.`,
      );
    }
  }

  // 4. Soft warn: name (idx 0) empty for everyone.
  if (emptyByIdx[0] === total) {
    warnings.push(
      `All ${total} recipients have an empty name. They will be greeted as "there".`,
    );
  } else if (emptyByIdx[0] / total > 0.2) {
    warnings.push(
      `${emptyByIdx[0]} of ${total} recipients have no name and will be greeted as "there".`,
    );
  }

  return { warnings };
}

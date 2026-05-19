/**
 * Preset-based ingestion: hardcoded recipes the operator picks from.
 *
 * Variable model (read this before changing anything):
 *
 *   per_row          - changes per recipient. Source = a column in the raw data
 *                      (e.g. var_1 from `first_name`). Name fallbacks like
 *                      "there" are allowed when the source is empty.
 *
 *   campaign_static  - SAME text for every recipient in the campaign.
 *                      Pasted by the operator at batch creation time
 *                      (copied from Materials). Codex must NEVER apply name
 *                      fallbacks ("your team", "your space", ...) to these.
 *
 * The Codex prompt is generated deterministically from the preset + the values
 * the operator pasted in the Create-batch dialog.
 */

export type PresetVariableKind = "per_row" | "campaign_static";

export type PresetVariable = {
  key: string;
  kind: PresetVariableKind;
  description: string;
  /** Example text shown in the prompt (campaign_static value before operator overrides it). */
  example: string;
  /**
   * For per_row vars: the source column to pull from (e.g. "first_name").
   * For campaign_static vars: ignored.
   */
  source?: string;
  /**
   * For per_row vars: the fallback when the source is empty.
   * Only meaningful for per_row.
   */
  fallback?: string;
};

export type PrepPreset = {
  id: string;
  name: string;
  campaignType: "marketing" | "utility";
  blurb: string;
  recommendedFor: string;
  requiredSourceFields: string[];
  optionalSourceFields: string[];
  variables: PresetVariable[];
  isRecommended?: boolean;
};

/**
 * Phrases that are valid name fallbacks for var_1, but indicate broken data
 * if they ever land in var_2 / var_3 / etc. The Launch QA blocks on these.
 */
export const NAME_FALLBACK_PHRASES = [
  "there",
  "your team",
  "your space",
  "your area",
  "your role",
  "your company",
] as const;

export const PREP_PRESETS: PrepPreset[] = [
  {
    id: "utility_basic_3",
    name: "Utility Basic - 3 vars",
    campaignType: "utility",
    blurb: "Name (per row) + 2 campaign-static lines pasted from Materials.",
    recommendedFor: "Standard utility template with 3 placeholders.",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["company", "city"],
    variables: [
      { key: "var_1", kind: "per_row", description: "First name", example: "Ahmed", source: "first_name", fallback: "there" },
      { key: "var_2", kind: "campaign_static", description: "Short context line - same for everyone", example: "your recent inquiry" },
      { key: "var_3", kind: "campaign_static", description: "Long pitch sentence - same for everyone", example: "We have a quick option that may be a fit." },
    ],
    isRecommended: true,
  },
  {
    id: "utility_personalized_proof",
    name: "Utility Personalized Proof",
    campaignType: "utility",
    blurb: "Name (per row) + 1 campaign-static proof sentence.",
    recommendedFor: "Utility template that opens with a name and one campaign-static proof line.",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["company"],
    variables: [
      { key: "var_1", kind: "per_row", description: "First name", example: "Sara", source: "first_name", fallback: "there" },
      { key: "var_2", kind: "campaign_static", description: "Proof / pitch sentence - same for everyone", example: "we run outreach for teams like yours" },
    ],
  },
  {
    id: "marketing_basic",
    name: "Marketing Basic",
    campaignType: "marketing",
    blurb: "Name only, marketing category.",
    recommendedFor: "Broad marketing blasts (single-variable templates).",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["city"],
    variables: [
      { key: "var_1", kind: "per_row", description: "First name", example: "Layla", source: "first_name", fallback: "there" },
    ],
  },
  {
    id: "marketing_static_2",
    name: "Marketing - 2 vars (1 static)",
    campaignType: "marketing",
    blurb: "Name (per row) + 1 campaign-static line. Paste copy from Materials at batch creation.",
    recommendedFor: "Marketing templates with {{1}} name + {{2}} campaign-static context line.",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["company", "industry"],
    variables: [
      { key: "var_1", kind: "per_row", description: "First name", example: "Mark", source: "first_name", fallback: "there" },
      { key: "var_2", kind: "campaign_static", description: "Short context - same for everyone", example: "retail channel expansion opportunities" },
    ],
  },
  {
    id: "marketing_static_3",
    name: "Marketing - 3 vars (2 static)",
    campaignType: "marketing",
    blurb: "Name (per row) + 2 campaign-static lines pasted from Materials. Use this for goflow / FB Marketing.",
    recommendedFor: "Marketing templates with {{1}} name + {{2}} short context + {{3}} long pitch sentence (all campaign-static).",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["company", "industry"],
    variables: [
      { key: "var_1", kind: "per_row", description: "First name", example: "Mark", source: "first_name", fallback: "there" },
      { key: "var_2", kind: "campaign_static", description: "Short context - same for everyone", example: "retail channel expansion opportunities" },
      { key: "var_3", kind: "campaign_static", description: "Long pitch sentence - same for everyone", example: "We have a few exclusive incentives and partnership opportunities available with Amazon, Walmart, Target, Macy's, Nordstrom, Best Buy, Home Depot, and Lowe's, and I wanted to see if it may be worth exploring if your products are a fit." },
    ],
  },
];

export const getPresetById = (id: string) => PREP_PRESETS.find((p) => p.id === id) ?? null;

/**
 * Codex prep prompts insert audience rows into Arseny's PERSONAL Supabase project,
 * NOT into Lovable Cloud. The Lovable Cloud edge function `import-audience-from-personal`
 * then pulls the prepared rows into this workspace.
 *
 * Hardcoded by design — do NOT swap this for VITE_SUPABASE_URL (which points at
 * Lovable Cloud `xglfamaa...`). See mem://reference/data-sources.
 */
const PERSONAL_SUPABASE_PROJECT_REF = "pdoddfoyrutakwemejpe";
const PERSONAL_SUPABASE_URL = `https://${PERSONAL_SUPABASE_PROJECT_REF}.supabase.co`;

/**
 * Map of campaign_static var key -> exact text for this batch.
 * Provided by the operator in the Create batch dialog.
 */
export type StaticValues = Record<string, string>;

/** Compact human-readable cheat sheet that we show in the UI next to every prompt. */
export const VARIABLE_KIND_EXPLAINER = `How variables work
- var_1 = per recipient (name). Fallback "there" allowed when name is missing.
- var_2 / var_3 etc. = SAME text for everyone in this campaign. Paste exact copy from Materials.
- Codex must never apply name fallbacks ("your team", "your space", ...) to var_2 / var_3.`;

const indentBlock = (s: string) => s.split("\n").map((l) => `  ${l}`).join("\n");

export function buildPresetPrompt(
  preset: PrepPreset,
  ctx: { workspaceName: string; workspaceId: string; batchId?: string; staticValues?: StaticValues },
): string {
  const staticValues = ctx.staticValues ?? {};
  const perRow = preset.variables.filter((v) => v.kind === "per_row");
  const campaignStatic = preset.variables.filter((v) => v.kind === "campaign_static");

  const variableSpec = preset.variables.map((v) => {
    if (v.kind === "per_row") {
      const fb = v.fallback ? ` ; if missing -> "${v.fallback}"` : "";
      return `  - ${v.key}  [PER ROW]   <- source column "${v.source ?? "?"}"${fb}`;
    }
    const value = staticValues[v.key] ?? v.example;
    return `  - ${v.key}  [SAME FOR EVERYONE]\n      """\n${indentBlock(value)}\n      """`;
  }).join("\n");

  const sampleDerived = preset.variables.map((v) => {
    const val = v.kind === "campaign_static" ? (staticValues[v.key] ?? v.example) : v.example;
    return `"${v.key}": ${JSON.stringify(val)}`;
  }).join(", ");

  const banList = NAME_FALLBACK_PHRASES.map((p) => `"${p}"`).join(", ");

  return `You are preparing a WhatsApp audience batch for the "${ctx.workspaceName}" workspace.

===========================================================================
INSERT TARGET — READ THIS FIRST
  Personal Supabase project (NOT Lovable Cloud):
    project ref:  ${PERSONAL_SUPABASE_PROJECT_REF}
    project url:  ${PERSONAL_SUPABASE_URL}
    table:        public.audience_rows
    workspace_id: ${ctx.workspaceId}
    batch_id:     ${ctx.batchId ?? "<MISSING — create the batch first from the Data page, then re-copy this prompt>"}
  DO NOT insert into the Lovable Cloud project (xglfamaaotmwulglwcui).
  Use the batch_id above as-is. Do NOT create a new batch.
===========================================================================

PRESET: ${preset.name}
Campaign type: ${preset.campaignType}
${preset.blurb}

GOAL
Take the raw rows the operator gives you and produce a clean, validated dataset for direct insertion into public.audience_rows on the PERSONAL Supabase project above (ref ${PERSONAL_SUPABASE_PROJECT_REF}). Do NOT ask follow-up questions. Use the rules below as-is.

REQUIRED SOURCE FIELDS (must be present)
  ${preset.requiredSourceFields.join(", ")}

OPTIONAL SOURCE FIELDS
  ${preset.optionalSourceFields.join(", ") || "(none)"}

VARIABLE CONTRACT (READ TWICE)
${variableSpec}

VALIDATION RULES
  - phone: digits only (strip +, spaces, dashes); length 7-15; otherwise drop the row
  - drop in-batch duplicate phones (keep first occurrence)
  - trim every string value before using it
${perRow.map((v) => `  - ${v.key}: trim; if empty use fallback "${v.fallback ?? ""}" (do NOT drop the row)`).join("\n")}

DO NOT
  - apply name-fallbacks (${banList}) to any campaign_static variable (var_2, var_3, ...)
  - paraphrase, shorten, translate or "personalize" campaign_static variables
  - leave any campaign_static variable empty
  - copy the template's Gupshup "Sample" text into rows
  - invent values that are not present in the input

OUTPUT (single JSON array, one object per VALID row)
[
  {
    "phone": "9715xxxxxxxx",
    "payload": { /* original source columns minus phone */ },
    "derived_payload": { ${sampleDerived} },
    "validation_status": "valid"
  }
]

Every row's derived_payload MUST contain the exact campaign_static values shown above, byte-for-byte.

SANITY CHECK BEFORE INSERT (run on the full batch)
${perRow.map((v) => `  - ${v.key}: distinct count > 50% of total_valid OR every row uses fallback "${v.fallback ?? ""}". If neither -> warn but allow.`).join("\n")}
${campaignStatic.map((v) => `  - ${v.key}: every row equals the EXACT string above. Any deviation -> STOP, print failing rows, do NOT insert.`).join("\n")}

EXPECTED COUNTS (report at the end)
  - total_input
  - total_valid
  - total_invalid
  - total_duplicates

INSERT TARGET (PERSONAL Supabase project — NOT Lovable Cloud)
  project ref: ${PERSONAL_SUPABASE_PROJECT_REF}
  project url: ${PERSONAL_SUPABASE_URL}
  table: public.audience_rows
  workspace_id: ${ctx.workspaceId}
  batch_id: ${ctx.batchId ?? "<MISSING - create the batch first from the Data page>"}
  preset: ${preset.id}

BEFORE INSERT (CRITICAL — prevents the 0-unused stub-batch problem)
  If a batch with the same name "YYYY-MM-DD | COUNTRY | AUDIENCE" already
  exists in Lovable Cloud for this workspace, REUSE its batch_id.
  Never ask the operator to "create another batch" — duplicates show up in
  the Launch wizard and block the operator from selecting the real one.

WORKFLOW FOR CODEX
  1. Parse the raw input the operator pasted.
  2. Apply validation + dedupe rules above.
  3. Build derived_payload: per_row vars from the source columns, campaign_static vars copied byte-for-byte.
  4. Run the SANITY CHECK above. If any campaign_static check fails, STOP.
  5. Insert the rows into public.audience_rows in the PERSONAL Supabase project above (NOT into Lovable Cloud).
  6. Tell the operator to open the Data page and click "Pull from my Supabase" — that runs the \`import-audience-from-personal\` edge function on Lovable Cloud, which copies the rows into the workspace.
  7. Print the expected counts so the operator can verify before launching.`;
}

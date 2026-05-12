/**
 * Preset-based ingestion: hardcoded recipes the operator picks from.
 * No manual field/derived-variable setup required for the common cases.
 *
 * Each preset already encodes:
 *   - campaign type (marketing | utility)
 *   - the variable structure WhatsApp templates expect (var_1..var_N)
 *   - validation + dedupe rules
 *   - a Codex-ready prompt template
 *
 * The prompt is generated deterministically from the preset + workspace context.
 */

export type PrepPreset = {
  id: string;
  name: string;
  campaignType: "marketing" | "utility";
  /** Short blurb shown in the UI */
  blurb: string;
  /** When to pick this one */
  recommendedFor: string;
  /** Source columns Codex must extract / require from raw input */
  requiredSourceFields: string[];
  optionalSourceFields: string[];
  /** Output variable structure used by the WhatsApp template */
  variables: Array<{ key: string; description: string; example: string }>;
  /** Recommended for the most common utility flow */
  isRecommended?: boolean;
};

export const PREP_PRESETS: PrepPreset[] = [
  {
    id: "utility_basic_3",
    name: "Utility Basic - 3 vars",
    campaignType: "utility",
    blurb: "First name + 2 short context vars. Safe default for utility templates.",
    recommendedFor: "Standard utility template with 3 placeholders.",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["company", "city"],
    variables: [
      { key: "var_1", description: "First name", example: "Ahmed" },
      { key: "var_2", description: "Company or city", example: "Dubai" },
      { key: "var_3", description: "Short context (e.g. interest, product)", example: "off-plan" },
    ],
    isRecommended: true,
  },
  {
    id: "utility_personalized_proof",
    name: "Utility Personalized Proof",
    campaignType: "utility",
    blurb: "First name + a personalized proof line referencing the lead's context.",
    recommendedFor: "Utility template that opens with a name and one personalised sentence.",
    requiredSourceFields: ["phone", "first_name", "context"],
    optionalSourceFields: ["company"],
    variables: [
      { key: "var_1", description: "First name", example: "Sara" },
      { key: "var_2", description: "Personalised proof sentence", example: "your recent inquiry about marina apartments" },
    ],
  },
  {
    id: "utility_4_vars",
    name: "Utility - 4 vars",
    campaignType: "utility",
    blurb: "Four-variable utility template (name, company, role, interest).",
    recommendedFor: "Longer utility templates with 4 placeholders.",
    requiredSourceFields: ["phone", "first_name", "company"],
    optionalSourceFields: ["role", "interest"],
    variables: [
      { key: "var_1", description: "First name", example: "Mark" },
      { key: "var_2", description: "Company", example: "Acme Realty" },
      { key: "var_3", description: "Role", example: "Sales lead" },
      { key: "var_4", description: "Interest / product", example: "Q4 inventory" },
    ],
  },
  {
    id: "marketing_basic",
    name: "Marketing Basic",
    campaignType: "marketing",
    blurb: "First name only, marketing category.",
    recommendedFor: "Broad marketing blasts (single-variable templates).",
    requiredSourceFields: ["phone", "first_name"],
    optionalSourceFields: ["city"],
    variables: [{ key: "var_1", description: "First name", example: "Layla" }],
  },
  {
    id: "marketing_per_row_2",
    name: "Marketing Per-Row - 2 vars",
    campaignType: "marketing",
    blurb: "First name + 1 unique per-contact line. Required for 2-placeholder marketing templates.",
    recommendedFor: "Marketing templates with {{1}} name + {{2}} per-contact context (industry, product, pain point).",
    requiredSourceFields: ["phone", "first_name", "context"],
    optionalSourceFields: ["company", "industry"],
    variables: [
      { key: "var_1", description: "First name", example: "Mark" },
      { key: "var_2", description: "Per-contact context line (UNIQUE per row, NEVER constant)", example: "retail channel expansion opportunities" },
    ],
  },
  {
    id: "marketing_per_row_3",
    name: "Marketing Per-Row - 3 vars",
    campaignType: "marketing",
    blurb: "First name + 2 unique per-contact lines. Required for 3-placeholder marketing templates (e.g. goflow, FB Marketing).",
    recommendedFor: "Marketing templates with {{1}} name + {{2}} short context + {{3}} long pitch sentence.",
    requiredSourceFields: ["phone", "first_name", "context", "pitch"],
    optionalSourceFields: ["company", "industry"],
    variables: [
      { key: "var_1", description: "First name", example: "Mark" },
      { key: "var_2", description: "Short per-contact context (UNIQUE per row)", example: "retail channel expansion opportunities" },
      { key: "var_3", description: "Long per-contact pitch sentence (UNIQUE per row)", example: "We have a few exclusive partnership opportunities with Amazon, Walmart, Target, and Macy's, and I wanted to see if it may be worth exploring if your products are a fit." },
    ],
  },
];

export const getPresetById = (id: string) => PREP_PRESETS.find((p) => p.id === id) ?? null;

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

export function buildPresetPrompt(
  preset: PrepPreset,
  ctx: { workspaceName: string; workspaceId: string; batchId?: string },
): string {
  const requiredVarKeys = preset.variables.map((v) => `"${v.key}": "${v.example}"`).join(", ");
  const variableSpec = preset.variables.map((v) => `  - ${v.key}: ${v.description} (example: "${v.example}")`).join("\n");
  return `You are preparing a WhatsApp audience batch for the "${ctx.workspaceName}" workspace.

PRESET: ${preset.name}
Campaign type: ${preset.campaignType}
${preset.blurb}

GOAL
Take the raw rows the operator gives you and produce a clean, validated dataset for direct insertion into public.audience_rows. Do NOT ask follow-up questions. Use the rules below as-is.

REQUIRED SOURCE FIELDS (must be present and non-empty)
  ${preset.requiredSourceFields.join(", ")}

OPTIONAL SOURCE FIELDS
  ${preset.optionalSourceFields.join(", ") || "(none)"}

OUTPUT VARIABLE STRUCTURE (one row per contact)
${variableSpec}

TEMPLATE VARIABLE CONTRACT (CRITICAL)
The WhatsApp template uses placeholders {{1}}, {{2}}, ... {{N}}.
At launch time the wizard maps each placeholder to derived_payload.var_<N>:
${preset.variables.map((v, i) => `  {{${i + 1}}} <- derived_payload.${v.key}  (${v.description})`).join("\n")}
Every var_<N> beyond var_1 MUST be UNIQUE per row (per-contact context).
If two rows would receive the same var_2 / var_3 value -- that is a data quality bug.
NEVER copy the template's "Sample" text into every row -- that defeats the per-row variable system
and means every contact receives identical filler text.
VALIDATION RULES
  - phone: digits only (strip +, spaces, dashes); length 7-15; otherwise drop the row
  - first_name: trim; if empty, use the fallback "there" (do NOT drop the row)
  - drop in-batch duplicate phones (keep first occurrence)
  - trim every string value before using it (no leading/trailing whitespace, ever)

NESTED VARIABLES (CRITICAL)
  - The operator's instructions for a variable may themselves contain placeholders
    referencing source columns, written as {Column Name} (case-insensitive, spaces allowed).
    Example: var_2 = "a demo booking system for {Company Name}"
    -> for each row, substitute {Company Name} with that row's "Company Name" value.
  - Resolve EVERY {Placeholder} before writing the row. The final derived_payload value
    must NEVER contain a literal "{...}" token, a trailing space, or a double space.
  - If a referenced column is missing, empty, or whitespace-only for a row, replace the
    placeholder with a smooth natural-language fallback so the sentence still reads clean.
    Suggested fallbacks:
      {Company Name}     -> "your team"
      {company}          -> "your team"
      {City}             -> "your area"
      {Role} / {Title}   -> "your role"
      {Industry}         -> "your space"
      {First Name}       -> "there"
      anything else      -> pick a neutral noun phrase that fits the surrounding sentence
  - After substitution, collapse repeated whitespace to a single space and trim the result.
  - NEVER leave a literal "{Company Name}" (or any other placeholder) inside derived_payload.
  - NEVER drop a row just because an optional/nested field is missing - apply the fallback instead.

PER-FIELD FALLBACKS
  - Apply fallbacks at the variable level too: if a derived variable resolves to an empty
    string after substitution, use the same neutral fallback rules above so the message
    never has a blank gap.

OUTPUT (single JSON array, one object per VALID row)
[
  {
    "phone": "9715xxxxxxxx",
    "payload": { /* original source columns minus phone */ },
    "derived_payload": { ${requiredVarKeys} },
    "validation_status": "valid"
  }
]

EXPECTED COUNTS (report at the end)
  - total_input
  - total_valid
  - total_invalid
  - total_duplicates

INSERT TARGET (Supabase / Lovable Cloud)
  table: public.audience_rows
  workspace_id: ${ctx.workspaceId}
  batch_id: ${ctx.batchId ?? "<MISSING - create the batch first from the Data page>"}
  preset: ${preset.id}
${SUPABASE_URL ? `  project url: ${SUPABASE_URL}` : ""}

IMPORTANT
  - Every inserted row MUST include both workspace_id and batch_id exactly as above.
  - Do NOT create a new audience_batches row - it already exists.

WORKFLOW FOR CODEX
  1. Parse the raw input the operator pasted.
  2. Apply validation + dedupe rules above.
  3. Render derived_payload using the variable structure (var_1..var_N).
  4. Produce the JSON array.
  5. Insert the rows into public.audience_rows for the workspace_id and batch_id above.
  6. Print the expected counts so the operator can refresh the Data page and launch.

DO NOT
  - ask the operator to map columns manually
  - invent values that are not present in the input
  - include rows that fail validation
  - re-use phones already marked "used" in this workspace`;
}

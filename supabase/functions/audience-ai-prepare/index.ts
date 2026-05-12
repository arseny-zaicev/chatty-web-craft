import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  workspace_id: string;
  /** Sample rows (frontend should send the first ~150 rows max) */
  parsed_rows: Array<Record<string, string>>;
  /** All headers from the source file */
  all_headers: string[];
  /** Free-form instructions from operator: "only AE", "Имя -> first_name", etc. */
  user_hint?: string | null;
  /** Pasted message copy */
  pasted_copy?: string | null;
  /** Operator already picked a template by name (optional). */
  preferred_template_name?: string | null;
  /** Variables expected by the chosen template (helps mapping). */
  preferred_template_vars?: string[] | null;
  /** marketing | utility */
  campaign_type?: "marketing" | "utility" | null;
};

type AiResult = {
  column_mapping: Record<string, string>;
  static_values: Record<string, string>;
  matched_template_id: string | null;
  matched_template_name: string | null;
  matched_template_confidence: number;
  suggested_name: string;
  country_distribution: Record<string, number>;
  warnings: string[];
  notes: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = (await req.json()) as Body;
    if (!body.workspace_id) {
      return json({ error: "workspace_id required" }, 400);
    }
    if (!Array.isArray(body.parsed_rows) || body.parsed_rows.length === 0) {
      return json({ error: "parsed_rows required" }, 400);
    }
    if (!Array.isArray(body.all_headers) || body.all_headers.length === 0) {
      return json({ error: "all_headers required" }, 400);
    }

    // Authenticate caller
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load prep profile
    let profile: any = null;
    if (body.prep_profile_id) {
      const { data } = await admin
        .from("audience_prep_profiles")
        .select("*")
        .eq("id", body.prep_profile_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      profile = data;
    }

    // Load approved templates (lite)
    const { data: templates } = await admin
      .from("message_templates")
      .select("id, name, language, category, body, status")
      .eq("workspace_id", body.workspace_id)
      .in("status", ["approved", "paused"])
      .limit(200);

    // Build country distribution locally (cheaper than asking AI)
    const distribution = computeCountryDistribution(body.parsed_rows);

    // Trim sample for the LLM
    const sample = body.parsed_rows.slice(0, 30);
    const sampleHeaders = body.all_headers;

    const profileSummary = profile
      ? {
          name: profile.name,
          campaign_type: profile.campaign_type,
          template_label: profile.template_label,
          description: profile.description,
          required_fields: profile.required_fields,
          optional_fields: profile.optional_fields,
          derived_variables: profile.derived_variables,
          fallback_rules: profile.fallback_rules,
        }
      : null;

    const templateCatalog = (templates ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      category: t.category as string,
      language: t.language as string,
      body: ((t.body as string) ?? "").slice(0, 400),
    }));

    const systemPrompt = `You are a data preparation assistant for a WhatsApp outreach platform.
Your job: take a sample of an uploaded contact file and produce a deterministic plan to ingest it.

You DO:
  - propose a mapping from source column names to canonical fields (phone, first_name, etc.) and to prep-profile fields
  - propose static_values for variables that should be the same for everyone
  - try to match the operator's pasted copy to one of the approved templates by body similarity
  - propose a short audience name (date | country | audience-label)
  - flag warnings (missing columns, low variability, suspicious data)

You DO NOT:
  - invent column data
  - create new templates
  - guess values you cannot derive from the sample

Phone normalisation, dedup, validation are handled deterministically by the app — do not include those rules in mapping.

Always return a single tool call with the structured plan.`;

    const userPrompt = JSON.stringify(
      {
        workspace_country_distribution: distribution,
        prep_profile: profileSummary,
        sample_headers: sampleHeaders,
        sample_rows: sample,
        sample_total_rows: body.parsed_rows.length,
        operator_hint: body.user_hint ?? null,
        pasted_copy: body.pasted_copy ?? null,
        approved_templates: templateCatalog,
        date_today: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    );

    const tool = {
      type: "function",
      function: {
        name: "ingest_plan",
        description: "Return a deterministic ingestion plan for the operator to confirm.",
        parameters: {
          type: "object",
          properties: {
            column_mapping: {
              type: "object",
              description: "Map of source column name -> canonical field name (e.g. phone, first_name, city). Only include columns we can confidently map.",
              additionalProperties: { type: "string" },
            },
            static_values: {
              type: "object",
              description: "Values that should be the same for every row (e.g. currency, offer label). Empty object if none.",
              additionalProperties: { type: "string" },
            },
            matched_template_id: {
              type: ["string", "null"],
              description: "ID of the approved template whose body best matches the pasted copy. Null if no good match.",
            },
            matched_template_name: { type: ["string", "null"] },
            matched_template_confidence: {
              type: "number",
              description: "0..1. Use 0 if no copy was pasted or no match.",
            },
            suggested_name: {
              type: "string",
              description: "Short audience name like '2026-05-12 | AE | reactivation'.",
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description: "Human-readable warnings the operator should see before Confirm.",
            },
            notes: {
              type: "string",
              description: "One-paragraph summary of what was detected and what to double-check.",
            },
          },
          required: [
            "column_mapping",
            "static_values",
            "matched_template_id",
            "matched_template_name",
            "matched_template_confidence",
            "suggested_name",
            "warnings",
            "notes",
          ],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "ingest_plan" } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "Rate limit, try again in a moment" }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted - top up Lovable AI" }, 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiJson = await aiResp.json();
    const call = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 1000));
      return json({ error: "AI did not return a structured plan" }, 500);
    }

    let plan: AiResult;
    try {
      const parsed = JSON.parse(call.function.arguments);
      plan = {
        column_mapping: parsed.column_mapping ?? {},
        static_values: parsed.static_values ?? {},
        matched_template_id: parsed.matched_template_id ?? null,
        matched_template_name: parsed.matched_template_name ?? null,
        matched_template_confidence: Number(parsed.matched_template_confidence ?? 0),
        suggested_name: String(parsed.suggested_name ?? "").trim() || `Audience ${new Date().toISOString().slice(0, 10)}`,
        country_distribution: distribution,
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
        notes: String(parsed.notes ?? ""),
      };
    } catch (e) {
      console.error("Failed to parse AI args", e);
      return json({ error: "AI returned invalid JSON" }, 500);
    }

    return json(plan, 200);
  } catch (e) {
    console.error("audience-ai-prepare fatal", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const COUNTRY_CODES: Array<[string, string]> = [
  ["971", "AE"], ["972", "IL"], ["966", "SA"], ["965", "KW"], ["974", "QA"], ["973", "BH"], ["968", "OM"],
  ["1", "US"], ["44", "UK"], ["49", "DE"], ["33", "FR"], ["34", "ES"], ["39", "IT"], ["31", "NL"], ["351", "PT"],
  ["353", "IE"], ["41", "CH"], ["43", "AT"], ["46", "SE"], ["47", "NO"], ["45", "DK"], ["358", "FI"],
  ["7", "RU"], ["380", "UA"], ["48", "PL"], ["420", "CZ"], ["36", "HU"], ["40", "RO"],
  ["91", "IN"], ["86", "CN"], ["81", "JP"], ["82", "KR"], ["65", "SG"], ["60", "MY"], ["62", "ID"], ["63", "PH"], ["66", "TH"], ["84", "VN"],
  ["61", "AU"], ["64", "NZ"], ["55", "BR"], ["52", "MX"], ["54", "AR"], ["56", "CL"], ["57", "CO"],
  ["27", "ZA"], ["20", "EG"], ["234", "NG"], ["254", "KE"], ["212", "MA"],
];

function computeCountryDistribution(rows: Array<Record<string, string>>): Record<string, number> {
  const phoneKeys = ["phone", "phone_number", "phonenumber", "mobile", "msisdn", "tel", "number", "whatsapp", "wa"];
  const sorted = [...COUNTRY_CODES].sort((a, b) => b[0].length - a[0].length);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    let raw = "";
    for (const k of Object.keys(r)) {
      if (phoneKeys.includes(k.toLowerCase())) {
        raw = String(r[k] ?? "");
        break;
      }
    }
    if (!raw) continue;
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) continue;
    let code = "??";
    for (const [pref, c] of sorted) {
      if (digits.startsWith(pref)) {
        code = c;
        break;
      }
    }
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

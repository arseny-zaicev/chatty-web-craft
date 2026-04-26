import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  website_url: string;
}

const SYSTEM_PROMPT = `You are an expert AI SEO analyst specialized in Generative Engine Optimization (GEO) and how brands appear in AI-powered search results like Google AI Overviews, ChatGPT, Perplexity, and Gemini.

Given a website URL, you must produce a realistic, plausible AI SEO opportunity report estimating how much organic visibility this brand is currently MISSING in AI-powered search.

Be specific to the brand's actual industry inferred from the URL/domain. Numbers should be realistic for a small-to-mid agency or business (not millions). Use UK-style English when domain ends in .co.uk.

Tone: professional, data-driven, slightly alarming - this is a sales report meant to show the prospect what they're losing.`;

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string", description: "Inferred company name" },
    industry: { type: "string", description: "Inferred industry / niche" },
    summary: {
      type: "string",
      description: "2-3 sentence executive summary of the opportunity",
    },
    lost_monthly_impressions: {
      type: "integer",
      description:
        "Realistic estimated monthly impressions the brand is losing in AI search results. Range 5,000 - 250,000 depending on niche size.",
    },
    potential_customers_monthly: {
      type: "integer",
      description: "Estimated monthly potential customers missed (10-500)",
    },
    ai_visibility_score: {
      type: "integer",
      description: "Current AI visibility score 0-100 (usually low: 5-35)",
    },
    missed_queries: {
      type: "array",
      description:
        "6-8 high-intent queries where this brand should appear in AI results but doesn't. Real keywords related to their service.",
      items: {
        type: "object",
        properties: {
          query: { type: "string" },
          monthly_volume: { type: "integer" },
          intent: {
            type: "string",
            enum: ["commercial", "transactional", "informational"],
          },
          ai_platform: {
            type: "string",
            enum: [
              "Google AI Overview",
              "ChatGPT",
              "Perplexity",
              "Gemini",
              "Google SGE",
            ],
          },
        },
        required: ["query", "monthly_volume", "intent", "ai_platform"],
      },
    },
    ai_overview_simulations: {
      type: "array",
      description:
        "3 simulated Google AI Overview answers for queries in this brand's space, written as Google would render them. These should mention COMPETITORS, not the brand - to show what the brand is missing.",
      items: {
        type: "object",
        properties: {
          query: { type: "string", description: "The user's search query" },
          ai_answer: {
            type: "string",
            description:
              "A 3-4 sentence AI-generated answer as Google AI Overview would write it, mentioning 2-3 competitor brands by plausible names.",
          },
          cited_competitors: {
            type: "array",
            items: { type: "string" },
            description: "Names of competitor brands cited in the AI answer",
          },
        },
        required: ["query", "ai_answer", "cited_competitors"],
      },
    },
    recommendations: {
      type: "array",
      description: "4-6 specific actionable recommendations to fix this",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "description", "impact", "effort"],
      },
    },
  },
  required: [
    "company_name",
    "industry",
    "summary",
    "lost_monthly_impressions",
    "potential_customers_monthly",
    "ai_visibility_score",
    "missed_queries",
    "ai_overview_simulations",
    "recommendations",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ReqBody;
    let url = body.website_url?.trim();
    if (!url) {
      return new Response(JSON.stringify({ error: "website_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!url.startsWith("http")) url = `https://${url}`;

    // Create pending report
    const { data: pending, error: insErr } = await supabase
      .from("ai_seo_reports")
      .insert({
        user_id: userData.user.id,
        website_url: url,
        status: "analyzing",
      })
      .select()
      .single();

    if (insErr) {
      console.error("insert error", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY missing");
    }

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `Analyze this website and produce the AI SEO opportunity report: ${url}\n\nInfer the industry from the domain and produce realistic, brand-specific data.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "produce_ai_seo_report",
                description:
                  "Return the structured AI SEO opportunity report.",
                parameters: REPORT_SCHEMA,
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "produce_ai_seo_report" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      await supabase
        .from("ai_seo_reports")
        .update({ status: "failed" })
        .eq("id", pending.id);

      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit, please retry shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("no tool call", JSON.stringify(aiData).slice(0, 800));
      await supabase
        .from("ai_seo_reports")
        .update({ status: "failed" })
        .eq("id", pending.id);
      return new Response(
        JSON.stringify({ error: "AI did not return structured output" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const report = JSON.parse(toolCall.function.arguments);

    const { data: updated, error: upErr } = await supabase
      .from("ai_seo_reports")
      .update({
        status: "completed",
        company_name: report.company_name,
        industry: report.industry,
        lost_monthly_impressions: report.lost_monthly_impressions,
        report_data: report,
      })
      .eq("id", pending.id)
      .select()
      .single();

    if (upErr) {
      console.error("update error", upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ report: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fatal", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

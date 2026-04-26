import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  website_url: string;
}

// Restrict access to specific clients only
const ALLOWED_EMAILS = new Set<string>([
  "paras@pndigital.co.uk",
]);

const SYSTEM_PROMPT = `You are an expert AI SEO analyst specialized in Generative Engine Optimization (GEO) - how brands appear in AI-powered search results like Google AI Overviews, ChatGPT, Perplexity, and Gemini.

You will be given:
1. A website URL
2. The actual scraped text content from that website (homepage + meta info)

Your task: produce a HIGHLY brand-specific AI SEO opportunity report based on the REAL content of the site - what services/products they actually offer, who they serve, and where their actual target customers would search.

CRITICAL RULES:
- Base every query, every competitor, every recommendation on the ACTUAL content of the scraped website. Do NOT invent unrelated industries.
- If the site is a digital agency, queries should be about agency services they offer.
- If the site is e-commerce, queries about their products.
- Identify the ACTUAL target geography from the content (city, country mentioned).
- Competitor names in AI Overview simulations must be plausible REAL competitors in that exact niche & geography.
- Use UK-style English when domain ends in .co.uk.

Tone: professional, data-driven, slightly alarming - this is a sales report meant to show the prospect what they're losing.`;

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string", description: "Real company name from the scraped content" },
    industry: { type: "string", description: "Specific industry / niche based on actual site content" },
    summary: {
      type: "string",
      description: "2-3 sentence executive summary referencing what THIS specific brand actually does",
    },
    lost_monthly_impressions: {
      type: "integer",
      description: "Realistic estimated monthly impressions missed in AI search. Range 5,000 - 250,000.",
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
        "6-8 high-intent queries DIRECTLY related to the actual services/products from the scraped content",
      items: {
        type: "object",
        properties: {
          query: { type: "string" },
          monthly_volume: { type: "integer" },
          intent: { type: "string", enum: ["commercial", "transactional", "informational"] },
          ai_platform: {
            type: "string",
            enum: ["Google AI Overview", "ChatGPT", "Perplexity", "Gemini", "Google SGE"],
          },
        },
        required: ["query", "monthly_volume", "intent", "ai_platform"],
      },
    },
    ai_overview_simulations: {
      type: "array",
      description:
        "3 simulated Google AI Overview answers for queries DIRECTLY relevant to this brand's actual services. Mention 2-3 plausible real competitor brand names in the SAME niche & geography. Do NOT mention this brand.",
      items: {
        type: "object",
        properties: {
          query: { type: "string" },
          ai_answer: { type: "string", description: "3-4 sentence AI Overview answer mentioning competitor brands" },
          cited_competitors: {
            type: "array",
            items: { type: "string" },
            description: "Names of competitor brands cited",
          },
        },
        required: ["query", "ai_answer", "cited_competitors"],
      },
    },
    recommendations: {
      type: "array",
      description: "4-6 specific actionable recommendations referencing this brand's actual services",
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

// Strip HTML to plain text and extract meta info
function extractTextFromHtml(html: string): { text: string; title: string; description: string } {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] || "").trim();

  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = (descMatch?.[1] || "").trim();

  // Strip scripts/styles/noscript
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Convert headings/paragraphs/li to newlines
    .replace(/<\/(h[1-6]|p|li|div|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Cap at ~12k characters to leave room in the prompt
  if (text.length > 12000) text = text.slice(0, 12000) + "\n…[truncated]";

  return { text, title, description };
}

async function scrapeWebsite(url: string): Promise<{ text: string; title: string; description: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; IskraSEOBot/1.0; +https://iskra.ae)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn("scrape non-200", resp.status, url);
      return null;
    }
    const html = await resp.text();
    return extractTextFromHtml(html);
  } catch (e) {
    console.warn("scrape failed", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Restrict access
    const email = (userData.user.email || "").toLowerCase();
    if (!ALLOWED_EMAILS.has(email)) {
      return new Response(
        JSON.stringify({ error: "This feature is not available for your account." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    // Scrape the actual website
    const scraped = await scrapeWebsite(url);
    const scrapedBlock = scraped
      ? `SCRAPED CONTENT FROM ${url}\n--------\nTitle: ${scraped.title}\nMeta description: ${scraped.description}\n\nPage text:\n${scraped.text}`
      : `NOTE: Could not scrape ${url}. Infer the brand context only from the domain name itself, conservatively.`;

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
                `Analyze the following website and produce the AI SEO opportunity report.\n\nWebsite: ${url}\n\n${scrapedBlock}\n\nProduce a report that is SPECIFIC to the actual services / products described in the scraped content above. Do not invent unrelated industries.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "produce_ai_seo_report",
                description: "Return the structured AI SEO opportunity report.",
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTelegramNotification, escapeHtml } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: track submissions by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5; // 5 submissions per hour
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

// Separate rate limit for analytics (more permissive)
const ANALYTICS_RATE_LIMIT_MAX = 100; // 100 analytics events per hour
const analyticsRateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, isAnalytics = false): boolean {
  const now = Date.now();
  const map = isAnalytics ? analyticsRateLimitMap : rateLimitMap;
  const max = isAnalytics ? ANALYTICS_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
  const record = map.get(ip);

  if (!record || now > record.resetTime) {
    map.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= max) {
    return false;
  }

  record.count++;
  return true;
}

// Validation functions
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validatePhone(phone: string): boolean {
  const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,20}$/;
  return phoneRegex.test(phone);
}

function validateString(str: string, minLength: number, maxLength: number): boolean {
  return typeof str === "string" && str.trim().length >= minLength && str.length <= maxLength;
}

function validateUrl(url: string): boolean {
  if (!url || url.trim() === "") return true; // Optional field
  try {
    new URL(url);
    return url.length <= 500;
  } catch {
    return false;
  }
}

function validateJsonbSize(data: unknown): boolean {
  try {
    const jsonStr = JSON.stringify(data);
    return jsonStr.length < 10000; // 10KB limit
  } catch {
    return false;
  }
}

// Analytics validation functions
const VALID_FORM_TYPES_ANALYTICS = ["qualification", "seller_leads", "whatsapp_outreach", "bm_access", "demo_request"];
const VALID_EVENT_TYPES = ["step_viewed", "step_completed", "form_submitted"];

function validateSessionId(sessionId: string): boolean {
  // Format: timestamp-randomstring (e.g., "1704067200000-abc123def")
  const sessionIdRegex = /^\d{13}-[a-z0-9]{9}$/;
  return sessionIdRegex.test(sessionId);
}

function validateStepNumber(stepNumber: number): boolean {
  return Number.isInteger(stepNumber) && stepNumber > 0 && stepNumber <= 20;
}

function validateStepName(stepName: string): boolean {
  return typeof stepName === "string" && stepName.length >= 1 && stepName.length <= 100;
}

function validateEventType(eventType: string): boolean {
  return VALID_EVENT_TYPES.includes(eventType);
}

function validateAnalyticsMetadata(metadata: unknown): boolean {
  if (!metadata) return true;
  try {
    const jsonStr = JSON.stringify(metadata);
    return jsonStr.length < 5120; // 5KB limit for metadata
  } catch {
    return false;
  }
}

const VALID_FORM_TYPES = ["qualification", "seller_leads", "whatsapp_outreach", "demo_request", "bm_access"];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                     req.headers.get("cf-connecting-ip") || 
                     "unknown";

    const body = await req.json();
    
    // Route to analytics handler if action is track-analytics
    if (body.action === "track-analytics") {
      return await handleAnalytics(body, clientIp);
    }

    // Original form submission handling
    // Check rate limit for form submissions
    if (!checkRateLimit(clientIp, false)) {
      console.log(`Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Too many submissions. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Form submission received:", { form_type: body.form_type, ip: clientIp });

    // Validate form_type
    if (!body.form_type || !VALID_FORM_TYPES.includes(body.form_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid form type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // BM access form is anonymous (no contact fields required)
    const isAnonymous = body.form_type === "bm_access";
    // Quick contact (FAQ form) requires name + phone, email optional
    const isQuickContact = body.form_type === "demo_request" && !body.contact_email;

    // Validate contact_name
    if (!isAnonymous && !validateString(body.contact_name || "", 2, 100)) {
      return new Response(
        JSON.stringify({ error: "Name must be between 2 and 100 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate contact_email (required unless anonymous or quick-contact)
    if (!isAnonymous && !isQuickContact && (!body.contact_email || !validateEmail(body.contact_email))) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Quick contact requires phone
    if (isQuickContact && (!body.contact_phone || !validatePhone(body.contact_phone))) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate contact_phone (if provided)
    if (body.contact_phone && !validatePhone(body.contact_phone)) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate contact_company (if provided)
    if (body.contact_company && !validateString(body.contact_company, 1, 200)) {
      return new Response(
        JSON.stringify({ error: "Company name must be less than 200 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate contact_website (if provided)
    if (body.contact_website && !validateUrl(body.contact_website)) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid website URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate data JSONB size
    if (body.data && !validateJsonbSize(body.data)) {
      return new Response(
        JSON.stringify({ error: "Form data is too large" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Insert validated data
    const { data, error } = await adminClient.from("form_submissions").insert({
      form_type: body.form_type,
      contact_name: body.contact_name?.trim(),
      contact_email: body.contact_email?.toLowerCase().trim(),
      contact_phone: body.contact_phone?.trim() || null,
      contact_company: body.contact_company?.trim() || null,
      contact_website: body.contact_website?.trim() || null,
      data: body.data || {},
      status: "new",
    }).select().single();

    if (error) {
      console.error("Database insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to submit form. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Form submission successful:", { id: data.id, form_type: body.form_type });

    // Fire-and-forget Telegram notification
    try {
      const lines = [
        `🆕 <b>New ${escapeHtml(body.form_type)} submission</b>`,
        body.contact_name ? `👤 ${escapeHtml(body.contact_name)}` : null,
        body.contact_email ? `✉️ ${escapeHtml(body.contact_email)}` : null,
        body.contact_phone ? `📞 ${escapeHtml(body.contact_phone)}` : null,
        body.contact_company ? `🏢 ${escapeHtml(body.contact_company)}` : null,
        body.contact_website ? `🌐 ${escapeHtml(body.contact_website)}` : null,
      ].filter(Boolean);

      // Append form answers from data jsonb
      const dataObj = (body.data && typeof body.data === "object") ? body.data as Record<string, unknown> : {};
      const skipKeys = new Set(["source", "calendly"]);
      const answerLines: string[] = [];
      for (const [key, value] of Object.entries(dataObj)) {
        if (skipKeys.has(key)) continue;
        if (value === null || value === undefined || value === "") continue;
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        let valStr: string;
        if (Array.isArray(value)) valStr = value.join(", ");
        else if (typeof value === "object") valStr = JSON.stringify(value);
        else valStr = String(value);
        if (valStr.length > 200) valStr = valStr.slice(0, 200) + "…";
        answerLines.push(`• <b>${escapeHtml(label)}:</b> ${escapeHtml(valStr)}`);
      }
      if (answerLines.length > 0) {
        lines.push("", "<b>Answers:</b>", ...answerLines.slice(0, 20));
      }

      await sendTelegramNotification(lines.join("\n"));
    } catch (e) {
      console.error("Telegram notify failed", e);
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Analytics tracking handler
async function handleAnalytics(body: Record<string, unknown>, clientIp: string): Promise<Response> {
  // Check analytics rate limit
  if (!checkRateLimit(clientIp, true)) {
    console.log(`Analytics rate limit exceeded for IP: ${clientIp}`);
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate session_id
  if (!body.session_id || !validateSessionId(body.session_id as string)) {
    return new Response(
      JSON.stringify({ error: "Invalid session ID format" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate form_type
  if (!body.form_type || !VALID_FORM_TYPES_ANALYTICS.includes(body.form_type as string)) {
    return new Response(
      JSON.stringify({ error: "Invalid form type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate step_number
  if (!body.step_number || !validateStepNumber(body.step_number as number)) {
    return new Response(
      JSON.stringify({ error: "Invalid step number" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate step_name
  if (!body.step_name || !validateStepName(body.step_name as string)) {
    return new Response(
      JSON.stringify({ error: "Invalid step name" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate event_type
  if (!body.event_type || !validateEventType(body.event_type as string)) {
    return new Response(
      JSON.stringify({ error: "Invalid event type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate metadata size
  if (body.metadata && !validateAnalyticsMetadata(body.metadata)) {
    return new Response(
      JSON.stringify({ error: "Metadata is too large" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Create Supabase admin client
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Insert validated analytics data
  const { error } = await adminClient.from("form_analytics").insert({
    session_id: body.session_id,
    form_type: body.form_type,
    step_number: body.step_number,
    step_name: body.step_name,
    event_type: body.event_type,
    metadata: body.metadata || {},
  });

  if (error) {
    console.error("Analytics insert error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to track analytics" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

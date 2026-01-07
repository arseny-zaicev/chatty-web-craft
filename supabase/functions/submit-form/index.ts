import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: track submissions by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5; // 5 submissions
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
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

const VALID_FORM_TYPES = ["qualification", "seller_leads", "whatsapp_outreach"];

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

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      console.log(`Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Too many submissions. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    console.log("Form submission received:", { form_type: body.form_type, ip: clientIp });

    // Validate form_type
    if (!body.form_type || !VALID_FORM_TYPES.includes(body.form_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid form type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate contact_name
    if (!validateString(body.contact_name || "", 2, 100)) {
      return new Response(
        JSON.stringify({ error: "Name must be between 2 and 100 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate contact_email
    if (!body.contact_email || !validateEmail(body.contact_email)) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid email address" }),
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

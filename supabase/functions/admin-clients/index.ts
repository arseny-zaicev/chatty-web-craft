import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = "arseny@iskra.ae";

// ============= RATE LIMITING =============
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 100, windowMs: number = 60000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  // Clean up old entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

// ============= INPUT VALIDATION HELPERS =============
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validatePassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function validateCompanyName(name: string | undefined | null): boolean {
  if (!name) return true; // Optional field
  return typeof name === 'string' && name.length <= 200;
}

function validateGoogleSheetId(id: string): boolean {
  // Google Sheet IDs are typically 44 characters of alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]{20,50}$/.test(id);
}

function validateSheetName(name: string | undefined | null): boolean {
  if (!name) return true; // Optional, defaults to Sheet1
  return typeof name === 'string' && name.length <= 100 && !/[<>"'`]/.test(name);
}

function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

function validateLeadData(data: any): boolean {
  if (typeof data !== 'object' || data === null) return false;
  
  // Check for dangerous property names (prototype pollution)
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(data)) {
    if (dangerousKeys.includes(key)) return false;
    // Limit key length
    if (key.length > 100) return false;
    // Limit value length for string values
    const value = data[key];
    if (typeof value === 'string' && value.length > 5000) return false;
  }
  
  return true;
}

function validateLeadsArray(leads: any): boolean {
  if (!Array.isArray(leads)) return false;
  if (leads.length > 1000) return false; // Max 1000 leads per import
  return leads.every(lead => validateLeadData(lead));
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============= RATE LIMITING =============
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const { allowed, remaining } = checkRateLimit(clientIP, 100, 60000); // 100 requests per minute
    
    if (!allowed) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
          } 
        }
      );
    }

    // Get auth header to verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth check
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user is admin
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      console.error(`Access denied for user: ${user.email}`);
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${user.email} authenticated`);

    // Admin client with service role for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // List all clients
    if (action === "list") {
      const { data: clients, error } = await adminClient
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error listing clients:", error);
        throw new Error("Failed to list clients");
      }

      return new Response(
        JSON.stringify({ clients }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new client
    if (action === "create") {
      const { email, password, companyName, googleSheetId, sheetName } = body;

      // Validate required fields
      if (!email || !password || !googleSheetId) {
        return new Response(
          JSON.stringify({ error: "email, password, and googleSheetId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate email format
      if (!validateEmail(email)) {
        return new Response(
          JSON.stringify({ error: "Invalid email format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate password
      if (!validatePassword(password)) {
        return new Response(
          JSON.stringify({ error: "Password must be between 6 and 128 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate company name
      if (!validateCompanyName(companyName)) {
        return new Response(
          JSON.stringify({ error: "Company name must be less than 200 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate Google Sheet ID
      if (!validateGoogleSheetId(googleSheetId)) {
        return new Response(
          JSON.stringify({ error: "Invalid Google Sheet ID format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate sheet name
      if (!validateSheetName(sheetName)) {
        return new Response(
          JSON.stringify({ error: "Invalid sheet name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Creating user: ${email}`);

      // Create auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
      });

      if (authError) {
        console.error("Error creating user:", authError);
        throw new Error("Failed to create user");
      }

      const userId = authData.user.id;
      console.log(`User created with ID: ${userId}`);

      // Create client record (password NOT stored - managed by Supabase Auth only)
      const { data: clientData, error: clientError } = await adminClient
        .from("clients")
        .insert({
          user_id: userId,
          company_name: companyName || null,
          google_sheet_id: googleSheetId,
          sheet_name: sheetName || "Sheet1",
          email: email, // Store email for admin viewing
        })
        .select()
        .single();

      if (clientError) {
        console.error("Error creating client record:", clientError);
        // Try to clean up the auth user
        await adminClient.auth.admin.deleteUser(userId);
        throw new Error("Failed to create client record");
      }

      console.log(`Client record created: ${clientData.id}`);

      return new Response(
        JSON.stringify({ success: true, client: clientData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete client
    if (action === "delete") {
      const { clientId, userId } = body;

      if (!clientId || !userId) {
        return new Response(
          JSON.stringify({ error: "clientId and userId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUIDs
      if (!validateUUID(clientId) || !validateUUID(userId)) {
        return new Response(
          JSON.stringify({ error: "Invalid ID format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Deleting client: ${clientId}, user: ${userId}`);

      // Delete client leads first
      const { error: leadsError } = await adminClient
        .from("client_leads")
        .delete()
        .eq("client_id", clientId);

      if (leadsError) {
        console.error("Error deleting client leads:", leadsError);
      }

      // Delete client record
      const { error: clientError } = await adminClient
        .from("clients")
        .delete()
        .eq("id", clientId);

      if (clientError) {
        console.error("Error deleting client record:", clientError);
        throw new Error("Failed to delete client");
      }

      // Delete auth user
      const { error: authError } = await adminClient.auth.admin.deleteUser(userId);

      if (authError) {
        console.error("Error deleting user:", authError);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Import leads for a client
    if (action === "import-leads") {
      const { clientId, userId, leads } = body;

      if (!clientId || !userId || !leads) {
        return new Response(
          JSON.stringify({ error: "clientId, userId, and leads array are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUIDs
      if (!validateUUID(clientId) || !validateUUID(userId)) {
        return new Response(
          JSON.stringify({ error: "Invalid ID format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate leads array
      if (!validateLeadsArray(leads)) {
        return new Response(
          JSON.stringify({ error: "Invalid leads data. Maximum 1000 leads allowed." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Importing ${leads.length} leads for client ${clientId}`);

      // Get current max row_index
      const { data: existingLeads } = await adminClient
        .from("client_leads")
        .select("row_index")
        .eq("client_id", clientId)
        .order("row_index", { ascending: false })
        .limit(1);

      const startIndex = (existingLeads?.[0]?.row_index || 0) + 1;

      // Insert leads
      const inserts = leads.map((data: Record<string, string>, idx: number) => ({
        client_id: clientId,
        user_id: userId,
        row_index: startIndex + idx,
        data,
      }));

      const { error } = await adminClient
        .from("client_leads")
        .insert(inserts);

      if (error) {
        console.error("Error importing leads:", error);
        throw new Error("Failed to import leads");
      }

      console.log(`Successfully imported ${leads.length} leads`);

      return new Response(
        JSON.stringify({ success: true, count: leads.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get leads for a client
    if (action === "get-leads") {
      const { clientId } = body;

      if (!clientId) {
        return new Response(
          JSON.stringify({ error: "clientId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUID
      if (!validateUUID(clientId)) {
        return new Response(
          JSON.stringify({ error: "Invalid clientId format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: leads, error } = await adminClient
        .from("client_leads")
        .select("id, data")
        .eq("client_id", clientId)
        .order("row_index", { ascending: true });

      if (error) {
        console.error("Error fetching leads:", error);
        throw new Error("Failed to fetch leads");
      }

      return new Response(
        JSON.stringify({ leads }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete a single lead
    if (action === "delete-lead") {
      const { leadId } = body;

      if (!leadId) {
        return new Response(
          JSON.stringify({ error: "leadId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUID
      if (!validateUUID(leadId)) {
        return new Response(
          JSON.stringify({ error: "Invalid leadId format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await adminClient
        .from("client_leads")
        .delete()
        .eq("id", leadId);

      if (error) {
        console.error("Error deleting lead:", error);
        throw new Error("Failed to delete lead");
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update a single lead
    if (action === "update-lead") {
      const { leadId, data } = body;

      if (!leadId || !data) {
        return new Response(
          JSON.stringify({ error: "leadId and data are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUID
      if (!validateUUID(leadId)) {
        return new Response(
          JSON.stringify({ error: "Invalid leadId format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate lead data
      if (!validateLeadData(data)) {
        return new Response(
          JSON.stringify({ error: "Invalid lead data format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await adminClient
        .from("client_leads")
        .update({ data })
        .eq("id", leadId);

      if (error) {
        console.error("Error updating lead:", error);
        throw new Error("Failed to update lead");
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset client password
    if (action === "reset-password") {
      const { userId, newPassword } = body;

      if (!userId || !newPassword) {
        return new Response(
          JSON.stringify({ error: "userId and newPassword are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate UUID
      if (!validateUUID(userId)) {
        return new Response(
          JSON.stringify({ error: "Invalid userId format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate password
      if (!validatePassword(newPassword)) {
        return new Response(
          JSON.stringify({ error: "Password must be between 6 and 128 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Resetting password for user: ${userId}`);

      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (error) {
        console.error("Error resetting password:", error);
        throw new Error("Failed to reset password");
      }

      // Password is managed by Supabase Auth only - not stored in clients table

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in admin-clients function:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = "arseny@iskra.ae";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header to verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("No authorization header");
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
      throw new Error("Not authenticated");
    }

    if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      throw new Error("Access denied. Admin only.");
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
        throw new Error(error.message);
      }

      return new Response(
        JSON.stringify({ clients }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new client
    if (action === "create") {
      const { email, password, companyName, googleSheetId, sheetName } = body;

      if (!email || !password || !googleSheetId) {
        throw new Error("email, password, and googleSheetId are required");
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
        throw new Error(authError.message);
      }

      const userId = authData.user.id;
      console.log(`User created with ID: ${userId}`);

      // Create client record
      const { data: clientData, error: clientError } = await adminClient
        .from("clients")
        .insert({
          user_id: userId,
          company_name: companyName || null,
          google_sheet_id: googleSheetId,
          sheet_name: sheetName || "Sheet1",
        })
        .select()
        .single();

      if (clientError) {
        console.error("Error creating client record:", clientError);
        // Try to clean up the auth user
        await adminClient.auth.admin.deleteUser(userId);
        throw new Error(clientError.message);
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
        throw new Error("clientId and userId are required");
      }

      console.log(`Deleting client: ${clientId}, user: ${userId}`);

      // Delete client record first
      const { error: clientError } = await adminClient
        .from("clients")
        .delete()
        .eq("id", clientId);

      if (clientError) {
        console.error("Error deleting client record:", clientError);
        throw new Error(clientError.message);
      }

      // Delete auth user
      const { error: authError } = await adminClient.auth.admin.deleteUser(userId);

      if (authError) {
        console.error("Error deleting user:", authError);
        // Client record is already deleted, just log the error
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in admin-clients function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

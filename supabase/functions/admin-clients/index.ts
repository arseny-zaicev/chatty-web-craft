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
        throw new Error(clientError.message);
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

      if (!clientId || !userId || !leads || !Array.isArray(leads)) {
        throw new Error("clientId, userId, and leads array are required");
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
        throw new Error(error.message);
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
        throw new Error("clientId is required");
      }

      const { data: leads, error } = await adminClient
        .from("client_leads")
        .select("id, data")
        .eq("client_id", clientId)
        .order("row_index", { ascending: true });

      if (error) {
        console.error("Error fetching leads:", error);
        throw new Error(error.message);
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
        throw new Error("leadId is required");
      }

      const { error } = await adminClient
        .from("client_leads")
        .delete()
        .eq("id", leadId);

      if (error) {
        console.error("Error deleting lead:", error);
        throw new Error(error.message);
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
        throw new Error("leadId and data are required");
      }

      const { error } = await adminClient
        .from("client_leads")
        .update({ data })
        .eq("id", leadId);

      if (error) {
        console.error("Error updating lead:", error);
        throw new Error(error.message);
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
        throw new Error("userId and newPassword are required");
      }

      if (newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      console.log(`Resetting password for user: ${userId}`);

      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (error) {
        console.error("Error resetting password:", error);
        throw new Error(error.message);
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, secretKey } = await req.json();

    // Simple secret to prevent unauthorized access
    if (secretKey !== "iskra-init-2024") {
      throw new Error("Invalid secret key");
    }

    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Creating admin user: ${email}`);

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      // Update password if user exists
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        existingUser.id,
        { password }
      );

      if (updateError) {
        throw new Error(`Failed to update user: ${updateError.message}`);
      }

      console.log(`User ${email} password updated`);
      return new Response(
        JSON.stringify({ success: true, message: "Password updated for existing user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      throw new Error(`Failed to create user: ${authError.message}`);
    }

    console.log(`Admin user created: ${authData.user.id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Admin user created", userId: authData.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

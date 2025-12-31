import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schemas
function validateSpreadsheetId(id: string): boolean {
  // Google Sheet IDs are typically 44 characters of alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]{20,50}$/.test(id);
}

function validateSheetName(name: string): boolean {
  // Sheet names should be reasonable length and not contain dangerous characters
  return name.length > 0 && name.length <= 100 && !/[<>"'`]/.test(name);
}

function validateRange(range: string): boolean {
  // A1 notation validation - basic format like A1, A1:Z100
  return /^[A-Z]+[0-9]+(:[A-Z]+[0-9]+)?$/.test(range);
}

function validateValue(value: string): boolean {
  // Limit value length to prevent abuse
  return typeof value === 'string' && value.length <= 10000;
}

// Google Sheets API helper using Service Account
async function getAccessToken(serviceAccountKey: any, writeAccess: boolean = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const scope = writeAccess 
    ? "https://www.googleapis.com/auth/spreadsheets"
    : "https://www.googleapis.com/auth/spreadsheets.readonly";

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountKey.client_email,
    scope: scope,
    aud: serviceAccountKey.token_uri,
    iat: now,
    exp: exp,
  };

  // Base64url encode
  const encode = (obj: any) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key and sign
  const pemContents = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${unsignedToken}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(serviceAccountKey.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenResponse.ok) {
    console.error("Token exchange failed:", tokenData);
    throw new Error("Failed to get access token");
  }

  return tokenData.access_token;
}

async function fetchSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string = "Sheet1"
): Promise<any[][]> {
  // Google Sheets Values API expects A1 notation. Passing only a (quoted) sheet name
  // can fail to parse when the name has special characters. Request an explicit range.
  const rangeA1 = `'${sheetName}'!A:ZZ`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeA1)}`;

  console.log(`Fetching sheet data for authorized user`);
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Sheet fetch failed:", data);
    throw new Error("Failed to fetch sheet data");
  }

  return data.values || [];
}

async function updateSheetCell(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  range: string,
  value: string
): Promise<void> {
  // For sheet names with special characters, wrap in single quotes
  // and encode the entire range including quotes
  const fullRange = `'${sheetName}'!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;
  
  console.log(`Updating cell for authorized user`);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [[value]],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Sheet update failed:", data);
    throw new Error("Failed to update sheet");
  }

  console.log("Cell updated successfully");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============= AUTHENTICATION CHECK =============
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user authentication
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    // ============= INPUT VALIDATION =============
    const body = await req.json();
    const { spreadsheetId, sheetName = "Sheet1", action = "read", range, value } = body;
    
    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: "spreadsheetId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate spreadsheet ID format
    if (!validateSpreadsheetId(spreadsheetId)) {
      console.error("Invalid spreadsheet ID format");
      return new Response(
        JSON.stringify({ error: "Invalid spreadsheet ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate sheet name
    if (!validateSheetName(sheetName)) {
      console.error("Invalid sheet name");
      return new Response(
        JSON.stringify({ error: "Invalid sheet name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= AUTHORIZATION CHECK =============
    // Verify user has access to this spreadsheet (owns a client record with this sheet_id)
    const { data: clientData, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('google_sheet_id', spreadsheetId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (clientError) {
      console.error("Database error during authorization check:", clientError.message);
      return new Response(
        JSON.stringify({ error: "Authorization check failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clientData) {
      console.error(`User ${user.id} attempted to access unauthorized spreadsheet`);
      return new Response(
        JSON.stringify({ error: "You don't have access to this spreadsheet" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authorization verified for client: ${clientData.id}`);

    // ============= PROCESS REQUEST =============
    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyRaw) {
      throw new Error("Service configuration error");
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyRaw);

    // Handle update action
    if (action === "update") {
      if (!range || value === undefined) {
        return new Response(
          JSON.stringify({ error: "range and value are required for update action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate range format
      if (!validateRange(range)) {
        return new Response(
          JSON.stringify({ error: "Invalid range format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate value
      if (!validateValue(String(value))) {
        return new Response(
          JSON.stringify({ error: "Invalid value" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessToken = await getAccessToken(serviceAccountKey, true);
      await updateSheetCell(accessToken, spreadsheetId, sheetName, range, String(value));

      return new Response(
        JSON.stringify({ success: true, message: "Cell updated successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: read action
    const accessToken = await getAccessToken(serviceAccountKey, false);
    console.log("Successfully obtained access token");

    // Fetch sheet data
    const rows = await fetchSheetData(accessToken, spreadsheetId, sheetName);
    console.log(`Fetched ${rows.length} rows from sheet`);

    // Convert to objects using first row as headers
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ data: [], headers: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj: Record<string, string> = { _rowIndex: String(index + 2) }; // +2 because row 1 is headers
      headers.forEach((header: string, colIndex: number) => {
        obj[header] = row[colIndex] || "";
      });
      return obj;
    });

    return new Response(
      JSON.stringify({ data, headers, rowCount: data.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in google-sheets function:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

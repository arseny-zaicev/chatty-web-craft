import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`);
  }

  return tokenData.access_token;
}

async function fetchSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string = "Sheet1"
): Promise<any[][]> {
  // Wrap sheet name in single quotes to handle special characters like |, spaces, etc.
  const escapedSheetName = `'${sheetName}'`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(escapedSheetName)}`;
  
  console.log(`Fetching sheet data from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Sheet fetch failed:", data);
    throw new Error(`Failed to fetch sheet: ${data.error?.message || 'Unknown error'}`);
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
  // Wrap sheet name in single quotes to handle special characters
  const fullRange = `'${sheetName}'!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;
  
  console.log(`Updating cell at: ${fullRange} with value: ${value}`);
  
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
    throw new Error(`Failed to update sheet: ${data.error?.message || 'Unknown error'}`);
  }

  console.log("Cell updated successfully");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyRaw) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyRaw);
    
    const body = await req.json();
    const { spreadsheetId, sheetName = "Sheet1", action = "read", range, value } = body;
    
    if (!spreadsheetId) {
      throw new Error("spreadsheetId is required");
    }

    console.log(`Processing ${action} request for spreadsheet: ${spreadsheetId}, sheet: ${sheetName}`);

    // Handle update action
    if (action === "update") {
      if (!range || value === undefined) {
        throw new Error("range and value are required for update action");
      }

      const accessToken = await getAccessToken(serviceAccountKey, true);
      await updateSheetCell(accessToken, spreadsheetId, sheetName, range, value);

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
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

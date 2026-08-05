// salesforce.ts
// OAuth 2.0 Client Credentials Flow + a SOQL query helper.
// Only ever a client_id + client_secret in here - never a password.

interface TokenResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
}

let cachedToken: { accessToken: string; instanceUrl: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  const now = Date.now();

  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return { accessToken: cachedToken.accessToken, instanceUrl: cachedToken.instanceUrl };
  }

  const loginUrl = process.env.SF_LOGIN_URL;
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;

  if (!loginUrl || !clientId || !clientSecret) {
    throw new Error("Missing SF_LOGIN_URL, SF_CLIENT_ID, or SF_CLIENT_SECRET. Check your environment variables.");
  }

  const response = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Salesforce auth failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as TokenResponse;

  cachedToken = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    expiresAt: now + 15 * 60_000,
  };

  return { accessToken: cachedToken.accessToken, instanceUrl: cachedToken.instanceUrl };
}

export async function runSoqlQuery(soql: string): Promise<any> {
  const { accessToken, instanceUrl } = await getAccessToken();

  const url = `${instanceUrl}/services/data/v61.0/query?q=${encodeURIComponent(soql)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SOQL query failed (${response.status}): ${errText}`);
  }

  return response.json();
}

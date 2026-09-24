import { Auth, google } from "googleapis";
import "server-only";

// Server-only Sheets API v4 client. Never imported by client components —
// the `server-only` import above throws a build error if that ever happens.
// PRD §4: no "Publish to web" CSV — either auth path below is server-side
// only, and no sheet data reaches the browser except what's rendered.
//
// Two supported auth methods, tried in this order:
//  1. GOOGLE_SERVICE_ACCOUNT_KEY (service account JWT) — recommended: the
//     key doesn't expire on its own and there's nothing to re-authorize.
//  2. GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET /
//     GOOGLE_OAUTH_REFRESH_TOKEN (user OAuth2) — works against a sheet
//     shared with a real Google account instead of a service account
//     identity. IMPORTANT: if the Google Cloud OAuth consent screen is
//     left in "Testing" publishing status, Google expires the refresh
//     token after 7 days and this will start failing silently — set the
//     consent screen to "In production" to avoid that.

function loadServiceAccountKey(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(decoded);
}

function buildAuthClient(): Auth.OAuth2Client | Auth.JWT {
  const key = loadServiceAccountKey();
  if (key) {
    return new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  throw new Error(
    "No Google auth configured — set GOOGLE_SERVICE_ACCOUNT_KEY, or all three of " +
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN"
  );
}

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  sheetsClient = google.sheets({ version: "v4", auth: buildAuthClient() });
  return sheetsClient;
}

// Fetches an A1-notation range as unformatted values with serial-number
// dates (see lib/serial-date.ts) so date parsing is locale-independent.
export async function fetchRange(range: string): Promise<unknown[][]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID is not set");
  }
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  return (res.data.values ?? []) as unknown[][];
}

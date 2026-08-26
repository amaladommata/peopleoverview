import { google } from "googleapis";
import "server-only";

// Server-only Sheets API v4 client. Never imported by client components —
// the `server-only` import above throws a build error if that ever happens.
// PRD §4: no "Publish to web" CSV, service account + Sheets API only.

function loadServiceAccountKey(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }
  const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
  return JSON.parse(decoded);
}

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const key = loadServiceAccountKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
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

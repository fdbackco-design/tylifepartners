import { google } from "googleapis";

type AppendLeadRowArgs = {
  dateKstYmd: string; // YYYY-MM-DD
  medium: string; // 유입매체
  kind: "B2C" | "B2B"; // 광고구분
  name: string;
  phone: string;
};

function env(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  return t ? t : null;
}

function decodeServiceAccountJson(): any | null {
  const b64 = env("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  if (b64) {
    try {
      const json = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    // private_key의 개행이 \n로 들어오는 경우 보정
    const parsed = JSON.parse(raw);
    if (parsed?.private_key && typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch {
    return null;
  }
}

export function canAppendToGoogleSheet(): boolean {
  return Boolean(env("GOOGLE_SHEETS_ID") && decodeServiceAccountJson());
}

export async function appendLeadRowToGoogleSheet(args: AppendLeadRowArgs): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const spreadsheetId = env("GOOGLE_SHEETS_ID");
  const sheetName = env("GOOGLE_SHEETS_SHEET_NAME") || "시트1";
  const creds = decodeServiceAccountJson();
  if (!spreadsheetId || !creds) return { ok: true, skipped: true };

  try {
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // A열부터 E열까지 한 줄 추가
    const range = `${sheetName}!A:E`;
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[args.dateKstYmd, args.medium, args.kind, args.name, args.phone]],
      },
    });

    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}


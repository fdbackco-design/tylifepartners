import { google } from "googleapis";

type AppendLeadRowArgs = {
  dateKstYmd: string; // YYYY-MM-DD
  medium: string; // 유입매체
  kind: "B2C" | "B2B"; // 광고구분
  name: string;
  phone: string;
  entry_page?: string | null;
  region?: string | null;
  available_time?: string | null;
  age_group?: string | null;
  job?: string | null;
};

function sheetCell(v: string | null | undefined): string {
  if (v == null) return "";
  const t = String(v).trim();
  return t;
}

/** B열(인덱스 1)이 비었거나 행이 없으면 true */
function rowBEmpty(row: unknown[] | undefined): boolean {
  if (!row || row.length === 0) return true;
  const b = row[1];
  return b == null || String(b).trim() === "";
}

function nextSerialA(values: unknown[][], targetRow: number): number {
  const prevSheetRow = targetRow - 1;
  if (prevSheetRow < 2) return 1;
  const prevIdx = prevSheetRow - 2;
  const prevRow = values[prevIdx] as unknown[] | undefined;
  const raw = prevRow?.[0];
  const n = parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n + 1 : 1;
}

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

    const readRange = `${sheetName}!A2:B50000`;
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: readRange,
    });
    const values = (existing.data.values ?? []) as unknown[][];

    let insertIdx = -1;
    for (let i = 0; i < values.length; i++) {
      if (rowBEmpty(values[i] as unknown[])) {
        insertIdx = i;
        break;
      }
    }
    const targetRow = insertIdx >= 0 ? 2 + insertIdx : 2 + values.length;
    const serialA = nextSerialA(values, targetRow);

    const row: string[] = [
      String(serialA), // A: 직전 행 번호 + 1
      args.dateKstYmd, // B
      args.medium, // C
      args.kind, // D
      args.name, // E
      args.phone, // F
      "", "", "", "", "", "", "", // G~M
      sheetCell(args.entry_page), // N
      sheetCell(args.region), // O
      sheetCell(args.available_time), // P
      sheetCell(args.age_group), // Q
      sheetCell(args.job), // R
    ];

    const writeRange = `${sheetName}!A${targetRow}:R${targetRow}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: writeRange,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [row],
      },
    });

    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}


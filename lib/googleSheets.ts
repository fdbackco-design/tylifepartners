import { google } from "googleapis";
import { isGoogleSheetPhoneBlacklisted } from "@/lib/phoneBlacklist";

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
  job_rank?: string | null;
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

function createSheetsClient(): SheetsClient | null {
  const creds = decodeServiceAccountJson();
  if (!creds) return null;
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** 시트1 F열(연락처)로 행 번호 조회 (1-based, 헤더 제외 데이터 행) */
export async function findMainSheetRowByPhone(
  spreadsheetId: string,
  sheetName: string,
  phone: string
): Promise<number | null> {
  const sheets = createSheetsClient();
  if (!sheets) return null;

  const target = normalizePhoneDigits(phone);
  if (!target) return null;

  const readRange = `${sheetName}!F2:F50000`;
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: readRange,
  });
  const values = (existing.data.values ?? []) as unknown[][];

  for (let i = 0; i < values.length; i++) {
    const cell = values[i]?.[0];
    if (cell == null) continue;
    const rowPhone = normalizePhoneDigits(String(cell));
    if (rowPhone && rowPhone === target) {
      return 2 + i;
    }
  }

  return null;
}

/** 시트1 G열(담당자) 단일 셀 업데이트 — 기존 행 append 로직과 분리 */
export async function updateMainSheetManagerColumn(
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,
  managerName: string
): Promise<{ ok: boolean; error?: string }> {
  const sheets = createSheetsClient();
  if (!sheets) {
    return { ok: false, error: "Google Sheets 서비스 계정이 설정되지 않았습니다." };
  }
  if (rowNumber < 2) {
    return { ok: false, error: "유효하지 않은 행 번호입니다." };
  }

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!G${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[managerName.trim()]] },
    });
    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}

type SheetsClient = ReturnType<typeof google.sheets>;

/**
 * 대상 시트의 다음 빈 행(B열 기준) + 직전 A 시리얼 + 1 계산
 */
async function findTargetRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetName: string
): Promise<{ targetRow: number; serialA: number }> {
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
  return { targetRow, serialA };
}

/**
 * 시트1: A:F 기본 정보 + O 유입페이지 + P~T 상세
 */
async function writeMainSheet(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetName: string,
  args: AppendLeadRowArgs
): Promise<void> {
  const { targetRow, serialA } = await findTargetRow(sheets, spreadsheetId, sheetName);

  const row: string[] = [
    String(serialA), // A
    args.dateKstYmd, // B
    args.medium, // C
    args.kind, // D
    args.name, // E
    args.phone, // F
    args.medium, // G
    "", "", "", "", "", "", "", // H~N
    sheetCell(args.entry_page), // O
    sheetCell(args.region), // P
    sheetCell(args.available_time), // Q
    sheetCell(args.age_group), // R
    sheetCell(args.job), // S
    sheetCell(args.job_rank), // T
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${targetRow}:T${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

/**
 * CRM 시트: A:F 기본 정보(시트1과 동일) + H:L 상세
 * (시트1의 P~T → CRM의 H~L)
 */
async function writeCrmSheet(
  sheets: SheetsClient,
  spreadsheetId: string,
  sheetName: string,
  args: AppendLeadRowArgs
): Promise<void> {
  const { targetRow, serialA } = await findTargetRow(sheets, spreadsheetId, sheetName);

  const row: string[] = [
    String(serialA), // A
    args.dateKstYmd, // B
    args.medium, // C
    args.kind, // D
    "", // E
    "", // F
    args.medium, // G
    sheetCell(args.region), // H
    sheetCell(args.available_time), // I
    sheetCell(args.age_group), // J
    sheetCell(args.job), // K
    sheetCell(args.job_rank), // L
    "", "", "", "", // M~P
    args.name, // Q
    args.phone, // R
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${targetRow}:R${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function appendLeadRowToGoogleSheet(args: AppendLeadRowArgs): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (isGoogleSheetPhoneBlacklisted(args.phone)) {
    return { ok: true, skipped: true };
  }

  const spreadsheetId = env("GOOGLE_SHEETS_ID");
  const mainSheetName = env("GOOGLE_SHEETS_SHEET_NAME") || "시트1";
  const crmSheetName = env("GOOGLE_SHEETS_CRM_SHEET_NAME") || "CRM";
  const creds = decodeServiceAccountJson();
  if (!spreadsheetId || !creds) return { ok: true, skipped: true };

  try {
    const sheets = createSheetsClient();
    if (!sheets) return { ok: true, skipped: true };

    await writeMainSheet(sheets, spreadsheetId, mainSheetName, args);

    // CRM 시트 기록 실패는 메인 기록 성공을 가리지 않도록 별도로 캐치
    try {
      await writeCrmSheet(sheets, spreadsheetId, crmSheetName, args);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("appendLeadRowToGoogleSheet CRM sheet error:", err);
    }

    return { ok: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { ok: false, error: err };
  }
}

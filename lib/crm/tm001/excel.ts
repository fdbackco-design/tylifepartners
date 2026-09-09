import * as XLSX from "xlsx";
import {
  needsReviewFromConfidence,
  normalizeTm001Phone,
  parseRoomFromRaw,
} from "@/lib/crm/tm001/types";

export type Tm001ExcelStayRow = {
  excelRow: number;
  name: string;
  phoneDisplay: string;
  normalizedPhone: string;
  rawPhone: string;
  visitCount: number;
  hotelName: string;
  region: string;
  detail: string;
  stayType: string;
  rawRoom: string;
  room: string;
  rawRoomType: string;
  url: string;
  siteName: string;
  confidence: string;
  needsReview: boolean;
  hotFlag: string;
};

export type Tm001ExcelParseResult = {
  sheetName: string;
  rows: Tm001ExcelStayRow[];
  issues: Array<{ row: number; message: string }>;
  uniquePhones: number;
};

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function normHeader(h: string): string {
  return cellStr(h).replace(/\s+/g, "").toLowerCase();
}

function findCol(headers: string[], candidates: string[]): number {
  const norms = headers.map(normHeader);
  for (const c of candidates) {
    const n = normHeader(c);
    const i = norms.indexOf(n);
    if (i >= 0) return i;
  }
  // partial
  for (const c of candidates) {
    const n = normHeader(c);
    const i = norms.findIndex((h) => h.includes(n) || n.includes(h));
    if (i >= 0) return i;
  }
  return -1;
}

function pickStaySheet(wb: XLSX.WorkBook): string {
  const names = wb.SheetNames;
  const preferred = names.find((n) => /숙박내역/.test(n) && /핫DB|우선/.test(n));
  if (preferred) return preferred;
  const anyStay = names.find((n) => /숙박/.test(n));
  if (anyStay) return anyStay;
  if (!names[0]) throw new Error("엑셀 시트가 없습니다.");
  return names[0];
}

/**
 * 핫DB 엑셀 → 숙박 행 목록 (고객 통합은 호출측)
 */
export function parseTm001HotDbWorkbook(buffer: ArrayBuffer | Buffer): Tm001ExcelParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = pickStaySheet(wb);
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (matrix.length < 2) {
    return { sheetName, rows: [], issues: [{ row: 0, message: "데이터 행이 없습니다." }], uniquePhones: 0 };
  }

  const headers = (matrix[0] ?? []).map((h) => cellStr(h));
  const col = {
    hot: findCol(headers, ["핫DB"]),
    visit: findCol(headers, ["이용횟수"]),
    name: findCol(headers, ["투숙자", "이름", "고객명"]),
    phone: findCol(headers, ["연락처", "전화번호", "휴대폰"]),
    rawRoom: findCol(headers, ["객실명"]),
    hotel: findCol(headers, ["숙소명(정리)", "숙소명", "숙소"]),
    region: findCol(headers, ["지역(시도)", "숙박지역", "지역"]),
    detail: findCol(headers, ["세부지역", "세부 지역"]),
    type: findCol(headers, ["숙소유형", "유형"]),
    url: findCol(headers, ["예약사이트 링크", "링크", "url"]),
    site: findCol(headers, ["사이트 등록명"]),
    confidence: findCol(headers, ["지역확신도", "확신도"]),
  };

  if (col.name < 0 || col.phone < 0) {
    return {
      sheetName,
      rows: [],
      issues: [
        {
          row: 0,
          message: `필수 컬럼(투숙자, 연락처)을 찾지 못했습니다. 시트: ${sheetName}`,
        },
      ],
      uniquePhones: 0,
    };
  }

  const rows: Tm001ExcelStayRow[] = [];
  const issues: Array<{ row: number; message: string }> = [];
  const phones = new Set<string>();

  for (let i = 1; i < matrix.length; i += 1) {
    const excelRow = i + 1;
    const cells = matrix[i] ?? [];
    const get = (idx: number) => (idx >= 0 && idx < cells.length ? cellStr(cells[idx]) : "");
    const name = get(col.name);
    const phoneRaw = get(col.phone);
    if (!name && !phoneRaw) continue;

    const phone = normalizeTm001Phone(phoneRaw);
    if (!phone) {
      issues.push({ row: excelRow, message: `연락처 무효: ${phoneRaw || "(빈값)"}` });
      continue;
    }
    if (!name) {
      issues.push({ row: excelRow, message: "투숙자명이 없습니다." });
      continue;
    }

    const hotelName = get(col.hotel) || get(col.rawRoom).split("(")[0]?.trim() || "";
    const rawRoom = get(col.rawRoom);
    const { room, rawRoomType } = parseRoomFromRaw(rawRoom, hotelName);
    const url = get(col.url);
    const confidence = get(col.confidence);
    const visitCount = Number(get(col.visit)) || 0;

    phones.add(phone.digits);
    rows.push({
      excelRow,
      name: name.slice(0, 40),
      phoneDisplay: phone.display,
      normalizedPhone: phone.digits,
      rawPhone: phone.rawDigits,
      visitCount,
      hotelName,
      region: get(col.region),
      detail: get(col.detail),
      stayType: get(col.type),
      rawRoom,
      room,
      rawRoomType,
      url,
      siteName: get(col.site),
      confidence,
      needsReview: needsReviewFromConfidence(confidence, url),
      hotFlag: get(col.hot),
    });
  }

  return { sheetName, rows, issues, uniquePhones: phones.size };
}

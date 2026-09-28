import * as XLSX from "xlsx";
import { normalizePhoneDigits } from "@/lib/phoneBlacklist";

/** 내보내기에서 선택적으로 제외하는 상담상태 */
export const EXPORT_CLOSED_STATUSES = ["거절", "수신거부", "번호오류", "계약완료", "가입완료"] as const;

const CLOSED = new Set<string>(EXPORT_CLOSED_STATUSES);

/** 비교용 국내 번호 (8210… → 010…) */
export function phoneExportKey(phone: string): string {
  let digits = normalizePhoneDigits(phone);
  if (digits.startsWith("82") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits.length >= 10 ? digits : "";
}

/** 쉼표, 세미콜론, 줄바꿈으로 구분된 제외 번호 */
export function phonesFromText(raw: string): Set<string> {
  const set = new Set<string>();
  for (const part of String(raw ?? "").split(/[,;\n\r]+/)) {
    const key = phoneExportKey(part);
    if (key) set.add(key);
  }
  return set;
}

/** 엑셀 모든 시트의 셀에서 전화번호만 수집 */
export function phonesFromWorkbook(buffer: Buffer): Set<string> {
  const set = new Set<string>();
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const key = phoneExportKey(String(cell ?? ""));
        if (key) set.add(key);
      }
    }
  }
  return set;
}

export function mergePhoneSets(...sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) {
    set.forEach((v) => out.add(v));
  }
  return out;
}

export function keepExportRow(
  row: { status: string; phone: string },
  opts: { excludeClosed: boolean; excludePhones: Set<string> }
): boolean {
  if (opts.excludeClosed && CLOSED.has(String(row.status ?? "").trim())) return false;
  if (opts.excludePhones.size) {
    const key = phoneExportKey(row.phone);
    if (key && opts.excludePhones.has(key)) return false;
  }
  return true;
}

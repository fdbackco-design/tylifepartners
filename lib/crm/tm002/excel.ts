import * as XLSX from "xlsx";
import { normalizeTm002Phone } from "@/lib/crm/tm002/types";

export type Tm002ExcelRow = {
  excelRow: number;
  name: string;
  phoneDisplay: string;
  normalizedPhone: string;
  rawPhone: string;
  /** 가입일 ISO (엑셀 시각을 KST로 해석). 없으면 null */
  joinedAt: string | null;
  flag: string;
  level: string;
  address: string;
  addressDetail: string;
};

export type Tm002ExcelParseResult = {
  sheetName: string;
  rows: Tm002ExcelRow[];
  issues: Array<{ row: number; message: string }>;
  uniquePhones: number;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HEADER_SCAN_ROWS = 6;

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function normHeader(h: unknown): string {
  return cellStr(h).replace(/\s+/g, "").toLowerCase();
}

/** 엑셀 일련번호(43922.39) 또는 날짜 문자열 → ISO. 엑셀 시각은 KST 벽시계로 본다. */
export function parseJoinedAt(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const utcMs = Math.round((v - 25569) * 86400 * 1000);
    return new Date(utcMs - KST_OFFSET_MS).toISOString();
  }
  const s = cellStr(v);
  if (/^\d+(\.\d+)?$/.test(s)) return parseJoinedAt(Number(s));
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) - KST_OFFSET_MS).toISOString();
}

type SheetParse = Tm002ExcelParseResult & { headerFound: boolean };

function parseSheet(sheetName: string, sheet: XLSX.WorkSheet): SheetParse {
  // raw: true → 가입일 일련번호·전화번호 숫자를 가공 없이 받는다
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }) as unknown[][];

  // 제목 행이 끼어 있는 시트가 있어 상단 몇 행 안에서 헤더(이름+연락처)를 찾는다
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, HEADER_SCAN_ROWS); i += 1) {
    const norms = (matrix[i] ?? []).map(normHeader);
    if (norms.includes("이름") && norms.includes("연락처")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return { sheetName, rows: [], issues: [], uniquePhones: 0, headerFound: false };
  }

  const norms = (matrix[headerIdx] ?? []).map(normHeader);
  const col = (name: string) => norms.indexOf(name);
  const idx = {
    name: col("이름"),
    phone: col("연락처"),
    joined: col("가입일"),
    flag: col("flag"),
    level: col("레벨"),
    address: col("주소"),
    detail: col("상세주소"),
  };

  const rows: Tm002ExcelRow[] = [];
  const issues: Array<{ row: number; message: string }> = [];
  const phones = new Set<string>();

  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const excelRow = i + 1;
    const cells = matrix[i] ?? [];
    const raw = (c: number) => (c >= 0 && c < cells.length ? cells[c] : "");
    const get = (c: number) => cellStr(raw(c));

    const name = get(idx.name);
    const phoneRaw = get(idx.phone);
    if (!name && !phoneRaw) continue;

    const phone = normalizeTm002Phone(phoneRaw);
    if (!phone) {
      issues.push({ row: excelRow, message: `연락처 무효: ${phoneRaw || "(빈값)"}` });
      continue;
    }
    if (!name) {
      issues.push({ row: excelRow, message: "이름이 없습니다." });
      continue;
    }

    phones.add(phone.digits);
    rows.push({
      excelRow,
      name: name.slice(0, 40),
      phoneDisplay: phone.display,
      normalizedPhone: phone.digits,
      rawPhone: phone.rawDigits,
      joinedAt: parseJoinedAt(raw(idx.joined)),
      flag: get(idx.flag),
      level: get(idx.level),
      address: get(idx.address),
      addressDetail: get(idx.detail),
    });
  }

  return { sheetName, rows, issues, uniquePhones: phones.size, headerFound: true };
}

/**
 * 레저스테이션 회원 엑셀 → 행 목록 (연락처 병합은 호출측).
 * 헤더가 있는 시트 중 데이터 행이 가장 많은 시트를 쓴다 (부분 추출본 시트가 함께 있어도 전체 시트를 선택).
 */
export function parseTm002Workbook(buffer: ArrayBuffer | Buffer): Tm002ExcelParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames.length) throw new Error("엑셀 시트가 없습니다.");

  const parsed = wb.SheetNames.map((n) => parseSheet(n, wb.Sheets[n])).filter((p) => p.headerFound);
  if (!parsed.length) {
    return {
      sheetName: wb.SheetNames[0],
      rows: [],
      issues: [{ row: 0, message: "필수 컬럼(이름, 연락처)이 있는 시트를 찾지 못했습니다." }],
      uniquePhones: 0,
    };
  }
  parsed.sort((a, b) => b.rows.length - a.rows.length);
  const { headerFound: _h, ...best } = parsed[0];
  return best;
}

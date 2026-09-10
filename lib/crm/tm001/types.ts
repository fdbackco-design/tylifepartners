import { normalizePhoneDigits } from "@/lib/phoneBlacklist";
import { formatPhoneKorean } from "@/lib/phone";

export const TM001_PARTNER_CODE = "1";
export const TM001_PARTNER_NAME = "TM001";

export const TM001_STATUSES = [
  "미접촉",
  "부재",
  "유효통화",
  "관심",
  "재콜",
  "거절",
  "수신거부",
  "번호오류",
  "계약완료",
] as const;

export type Tm001Status = (typeof TM001_STATUSES)[number];

export const TM001_PRODUCTS = ["썬크루즈", "스페셜라이프"] as const;
export type Tm001Product = (typeof TM001_PRODUCTS)[number];

export type Tm001Comment = {
  id: string;
  text: string;
  at: string;
  by?: string;
};

export type Tm001Stay = {
  id: string;
  customer_id: string;
  batch_id: string | null;
  hotel_name: string;
  region: string;
  detail: string;
  stay_type: string;
  room: string;
  raw_room: string;
  raw_room_type: string;
  url: string;
  site_name: string;
  confidence: string;
  needs_review: boolean;
  sort_order: number;
  created_at: string;
};

export type Tm001Customer = {
  id: string;
  partner_code: string;
  partner_name: string;
  batch_code: string;
  name: string;
  phone: string;
  normalized_phone: string;
  raw_phone: string | null;
  visit_count: number;
  assignee_id: string | null;
  assignee_name: string | null;
  assigned_at: string | null;
  status: Tm001Status;
  product: string | null;
  /** 재콜 예약 시각 (ISO) */
  meeting_at: string | null;
  memo: string;
  comments: Tm001Comment[];
  created_at: string;
  updated_at: string;
  stays: Tm001Stay[];
  /** 담당자 배정 이력 이름 체인 (관리자 표시용) */
  assignee_history?: string[];
};

export function isTm001Status(v: unknown): v is Tm001Status {
  return typeof v === "string" && (TM001_STATUSES as readonly string[]).includes(v);
}

export function isTm001ScheduledStatus(status: string): boolean {
  return status === "재콜";
}

export function isTm001Product(v: unknown): v is Tm001Product {
  return typeof v === "string" && (TM001_PRODUCTS as readonly string[]).includes(v);
}

/** 엑셀/원본 전화 → 010… digits (10~11) */
export function normalizeTm001Phone(raw: string): { digits: string; display: string; rawDigits: string } | null {
  let digits = normalizePhoneDigits(raw);
  const rawDigits = digits;
  if (!digits) return null;
  // 앞 0 누락 (1028045786 → 01028045786)
  if (digits.length === 10 && digits.startsWith("10")) digits = `0${digits}`;
  if (digits.length === 11 && digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  if (digits.length < 10 || digits.length > 11) return null;
  return { digits, display: formatPhoneKorean(digits), rawDigits };
}

export function formatBatchCode(n: number): string {
  const v = Math.max(1, Math.floor(n));
  return String(v).padStart(3, "0");
}

/** 동일 연락처에 여러 투숙자명: 첫 이름 (다른이름1, 다른이름2) */
export function formatMergedCustomerName(names: string[]): string {
  const ordered: string[] = [];
  for (const n of names) {
    const t = String(n ?? "").trim();
    if (!t || ordered.includes(t)) continue;
    ordered.push(t);
  }
  if (!ordered.length) return "";
  const [primary, ...rest] = ordered;
  if (!rest.length) return primary;
  return `${primary} (${rest.join(", ")})`;
}

export function parseBatchCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{1,4}$/.test(s)) return formatBatchCode(Number(s));
  if (/^\d{3}$/.test(s)) return s;
  return s.slice(0, 16);
}

export function needsReviewFromConfidence(confidence: string, url: string): boolean {
  const c = confidence.trim();
  if (!url.trim()) return true;
  if (!c) return false;
  if (/미확|확인\s*필요|불일|후보|낮음/i.test(c)) return true;
  return false;
}

/** 객실명 "숙소(룸)" → room display */
export function parseRoomFromRaw(rawRoom: string, hotelName: string): { room: string; rawRoomType: string } {
  const raw = String(rawRoom ?? "").trim();
  if (!raw) return { room: "", rawRoomType: "" };
  const open = raw.indexOf("(");
  const close = raw.lastIndexOf(")");
  if (open > 0 && close > open) {
    let inner = raw.slice(open + 1, close).trim();
    // 원본 보존용: 깨진 괄호 포함 가능
    const afterOpen = raw.slice(open + 1).trim();
    if (!inner && afterOpen) inner = afterOpen.replace(/\)$/, "");
    return { room: inner.replace(/\($/, "") || inner, rawRoomType: afterOpen.replace(/\)$/, "") || inner };
  }
  // hotel(room without close)
  const m = raw.match(/^(.+?)\((.+)$/);
  if (m) {
    const inner = m[2].replace(/\)$/, "");
    return { room: inner.replace(/\($/, "") || inner, rawRoomType: m[2] };
  }
  if (hotelName && raw.startsWith(hotelName)) {
    const rest = raw.slice(hotelName.length).replace(/^\(|\)$/g, "").trim();
    return { room: rest, rawRoomType: rest };
  }
  return { room: "", rawRoomType: "" };
}

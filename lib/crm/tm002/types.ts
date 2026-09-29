import { normalizePhoneDigits } from "@/lib/phoneBlacklist";
import { formatPhoneKorean } from "@/lib/phone";

export const TM002_PARTNER_CODE = "2";
export const TM002_PARTNER_NAME = "TM002";

export const TM002_STATUSES = [
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

export type Tm002Status = (typeof TM002_STATUSES)[number];

export const TM002_PRODUCTS = ["썬크루즈", "스페셜라이프"] as const;
export type Tm002Product = (typeof TM002_PRODUCTS)[number];

export type Tm002Comment = {
  id: string;
  text: string;
  at: string;
  by?: string;
};

export type Tm002Customer = {
  id: string;
  partner_code: string;
  partner_name: string;
  batch_code: string;
  name: string;
  phone: string;
  normalized_phone: string;
  raw_phone: string | null;
  /** 가입일 (ISO) */
  joined_at: string | null;
  flag: string;
  level: string;
  address: string;
  address_detail: string;
  assignee_id: string | null;
  assignee_name: string | null;
  assigned_at: string | null;
  status: Tm002Status;
  product: string | null;
  /** 재콜 예약 시각 (ISO) */
  meeting_at: string | null;
  memo: string;
  /** 영업자 수동 메모 수정 후 관리자 미열람 */
  memo_admin_unread: boolean;
  comments: Tm002Comment[];
  created_at: string;
  updated_at: string;
  /** 담당자 배정 이력 이름 체인 (관리자 표시용) */
  assignee_history?: string[];
};

export function isTm002Status(v: unknown): v is Tm002Status {
  return typeof v === "string" && (TM002_STATUSES as readonly string[]).includes(v);
}

export function isTm002ScheduledStatus(status: string): boolean {
  return status === "재콜";
}

export function isTm002Product(v: unknown): v is Tm002Product {
  return typeof v === "string" && (TM002_PRODUCTS as readonly string[]).includes(v);
}

/** 엑셀/원본 전화 → 010… digits (10~11). 앞 0 누락(1032800306)은 0을 붙여 010으로 맞춘다. */
export function normalizeTm002Phone(raw: string): { digits: string; display: string; rawDigits: string } | null {
  let digits = normalizePhoneDigits(raw);
  const rawDigits = digits;
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("10")) digits = `0${digits}`;
  if (digits.length === 11 && digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  if (digits.length < 10 || digits.length > 11) return null;
  return { digits, display: formatPhoneKorean(digits), rawDigits };
}

export function formatBatchCode(n: number): string {
  const v = Math.max(1, Math.floor(n));
  return String(v).padStart(3, "0");
}

/** 동일 연락처에 여러 이름: 첫 이름 (다른이름1, 다른이름2) */
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

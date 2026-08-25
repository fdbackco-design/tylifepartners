import { getSupabaseAdmin } from "@/lib/supabase";

/** 숫자만 남긴 연락처 (01012345678) */
export function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** 쉼표/세미콜론/줄바꿈으로 구분된 연락처 목록 파싱 (숫자만, 10자리 이상) */
function parsePhoneListFromEnv(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  const set = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const digits = normalizePhoneDigits(part);
    if (digits.length >= 10) set.add(digits);
  }
  return set;
}

let cachedSheetBlacklist: Set<string> | null = null;
let cachedBlockedLeads: Set<string> | null = null;

function getBlacklist(): Set<string> {
  if (!cachedSheetBlacklist) {
    cachedSheetBlacklist = parsePhoneListFromEnv(process.env.GOOGLE_SHEETS_PHONE_BLACKLIST);
  }
  return cachedSheetBlacklist;
}

function getBlockedLeadPhones(): Set<string> {
  if (!cachedBlockedLeads) {
    cachedBlockedLeads = parsePhoneListFromEnv(process.env.LEAD_BLOCKED_PHONES);
  }
  return cachedBlockedLeads;
}

/** 구글 시트 DB현황판 기록 제외 대상 연락처 */
export function isGoogleSheetPhoneBlacklisted(phone: string): boolean {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  return getBlacklist().has(digits);
}

/**
 * 상담 신청 자체를 차단할 연락처 (LEAD_BLOCKED_PHONES env).
 * DB 블랙리스트는 isLeadSubmissionBlockedAsync 사용.
 */
export function isLeadSubmissionBlocked(phone: string): boolean {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  return getBlockedLeadPhones().has(digits);
}

/**
 * env + DB(lead_blacklist) 기준 상담 신청 차단.
 * true면 DB 저장·시트·분배·이메일·CRM을 건너뛰고 성공 응답만 반환.
 */
export async function isLeadSubmissionBlockedAsync(phone: string): Promise<boolean> {
  if (isLeadSubmissionBlocked(phone)) return true;
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10) return false;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_blacklist")
      .select("id")
      .eq("normalized_phone", digits)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("isLeadSubmissionBlockedAsync:", error.message);
      return false;
    }
    return Boolean(data?.id);
  } catch (e) {
    console.error("isLeadSubmissionBlockedAsync:", e);
    return false;
  }
}

/** 로그용 마스킹 (01012345678 → 010****5678). 로그에 전체 번호를 남기지 않기 위함 */
export function maskPhoneForLog(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

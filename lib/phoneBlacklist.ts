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
 * 상담 신청 자체를 차단할 연락처 (LEAD_BLOCKED_PHONES).
 * true면 DB 저장·구글 시트·담당자 분배·이메일·CRM 동기화를 전부 건너뛰고
 * 고객에게는 기존과 동일한 성공 응답만 반환한다.
 *
 * 값은 개인정보이므로 소스코드에 하드코딩하지 않고 환경변수로만 관리한다.
 * (모듈 캐시를 쓰므로 값 변경 시 재배포가 필요하다)
 */
export function isLeadSubmissionBlocked(phone: string): boolean {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  return getBlockedLeadPhones().has(digits);
}

/** 로그용 마스킹 (01012345678 → 010****5678). 로그에 전체 번호를 남기지 않기 위함 */
export function maskPhoneForLog(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

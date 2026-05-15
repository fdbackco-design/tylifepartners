/** 숫자만 남긴 연락처 (01012345678) */
export function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function parseBlacklistFromEnv(): Set<string> {
  const raw = process.env.GOOGLE_SHEETS_PHONE_BLACKLIST;
  if (!raw?.trim()) return new Set();
  const set = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const digits = normalizePhoneDigits(part);
    if (digits.length >= 10) set.add(digits);
  }
  return set;
}

let cached: Set<string> | null = null;

function getBlacklist(): Set<string> {
  if (!cached) cached = parseBlacklistFromEnv();
  return cached;
}

/** 구글 시트 DB현황판 기록 제외 대상 연락처 */
export function isGoogleSheetPhoneBlacklisted(phone: string): boolean {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  return getBlacklist().has(digits);
}

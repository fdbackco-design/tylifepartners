/** 이름/연락처 검색 or 절. 하이픈·공백 포함 번호도 숫자만 저장된 phone과 매칭. */
export function buildLeadSearchOrFilter(search: string): string {
  const raw = search.replace(/,/g, "").trim();
  const digits = raw.replace(/\D/g, "");
  const parts = [`name.ilike.%${raw}%`, `phone.ilike.%${raw}%`];
  if (digits && digits !== raw) {
    parts.push(`phone.ilike.%${digits}%`);
  }
  if (digits) {
    parts.push(`normalized_phone.ilike.%${digits}%`);
  }
  return parts.join(",");
}

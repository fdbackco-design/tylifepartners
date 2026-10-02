import type { PartnerApiPermissions, PartnerResource } from "@/lib/partner/types";

/** 후보자: utm·유입·지역 중 하나 이상이 설정되어야 행 조회 가능 */
export function hasCandidateRowScope(p: Pick<
  PartnerApiPermissions,
  "candidate_utm_sources" | "candidate_entry_pages" | "candidate_regions"
>): boolean {
  return (
    p.candidate_utm_sources.length > 0 ||
    p.candidate_entry_pages.length > 0 ||
    p.candidate_regions.length > 0
  );
}

export function hasTm001RowScope(p: Pick<PartnerApiPermissions, "tm001_batch_codes">): boolean {
  return p.tm001_batch_codes.length > 0;
}

export function hasTm002RowScope(p: Pick<PartnerApiPermissions, "tm002_batch_codes">): boolean {
  return p.tm002_batch_codes.length > 0;
}

export function assertResourceAllowed(
  p: PartnerApiPermissions,
  resource: PartnerResource
): { ok: true } | { ok: false; code: "forbidden" | "scope_not_configured"; message: string } {
  if (resource === "candidates") {
    if (!p.allow_candidates) {
      return { ok: false, code: "forbidden", message: "이 키는 후보자 조회 권한이 없습니다." };
    }
    if (!hasCandidateRowScope(p)) {
      return {
        ok: false,
        code: "scope_not_configured",
        message: "후보자 행 범위(utm_source, entry_page, region)가 설정되지 않았습니다.",
      };
    }
    return { ok: true };
  }
  if (resource === "tm001") {
    if (!p.allow_tm001) {
      return { ok: false, code: "forbidden", message: "이 키는 TM001 조회 권한이 없습니다." };
    }
    if (!hasTm001RowScope(p)) {
      return {
        ok: false,
        code: "scope_not_configured",
        message: "TM001 batch_code 범위가 설정되지 않았습니다.",
      };
    }
    return { ok: true };
  }
  if (resource === "tm002") {
    if (!p.allow_tm002) {
      return { ok: false, code: "forbidden", message: "이 키는 TM002 조회 권한이 없습니다." };
    }
    if (!hasTm002RowScope(p)) {
      return {
        ok: false,
        code: "scope_not_configured",
        message: "TM002 batch_code 범위가 설정되지 않았습니다.",
      };
    }
    return { ok: true };
  }
  if (!p.allow_calendar) {
    return { ok: false, code: "forbidden", message: "이 키는 캘린더 조회 권한이 없습니다." };
  }
  if (!p.calendar_event_types.length) {
    return {
      ok: false,
      code: "scope_not_configured",
      message: "캘린더 event_type 범위가 설정되지 않았습니다.",
    };
  }
  return { ok: true };
}

/** 요청 region/status가 키 범위와 교집합인지 (후보자 region 필터) */
export function intersectAllowed(
  keyScope: string[],
  requestValues: string[] | undefined
): string[] {
  if (!requestValues?.length) return keyScope;
  const set = new Set(keyScope);
  return requestValues.filter((v) => set.has(v));
}

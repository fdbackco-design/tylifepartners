export type ManagedFormConfig = {
  /** 지역(기본) 필드 포함 여부 */
  includeRegion: boolean;
  /** 상담가능시간 필드 포함 여부 */
  includeAvailableTime: boolean;
  /** 지역 상세(구/시) 필수 드롭다운 노출 — includeRegion이 true일 때만 의미 있음 */
  allowRegionDetail: boolean;
  /** 연령대 필드 포함 */
  includeAgeGroup: boolean;
  /** 직업/직급 필드 포함 */
  includeJob: boolean;
};

export const DEFAULT_FORM_CONFIG: ManagedFormConfig = {
  includeRegion: true,
  includeAvailableTime: true,
  allowRegionDetail: true,
  includeAgeGroup: true,
  includeJob: true,
};

function readBool(
  src: Record<string, unknown>,
  camel: string,
  snake: string,
  fallback: boolean
): boolean {
  if (src[camel] !== undefined) return Boolean(src[camel]);
  if (src[snake] !== undefined) return Boolean(src[snake]);
  return fallback;
}

export function normalizeFormConfig(raw: unknown): ManagedFormConfig {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    includeRegion: readBool(src, "includeRegion", "include_region", true),
    includeAvailableTime: readBool(src, "includeAvailableTime", "include_available_time", true),
    allowRegionDetail: readBool(src, "allowRegionDetail", "allow_region_detail", true),
    includeAgeGroup: readBool(src, "includeAgeGroup", "include_age_group", true),
    includeJob: readBool(src, "includeJob", "include_job", true),
  };
}

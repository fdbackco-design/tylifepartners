import { BASE_REGIONS, isBaseRegion, type BaseRegion } from "@/lib/regions";

export type ManagedFormConfig = {
  /** 지역(기본) 필드 포함 여부 */
  includeRegion: boolean;
  /**
   * 상담폼에 노출할 기본 지역(큰 단위) 목록.
   * 비어 있거나 미설정이면 전체 BASE_REGIONS.
   */
  allowedRegions: BaseRegion[];
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
  allowedRegions: [...BASE_REGIONS],
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

function normalizeAllowedRegions(raw: unknown): BaseRegion[] {
  if (!Array.isArray(raw)) return [...BASE_REGIONS];
  const filtered = raw
    .map((v) => String(v).trim())
    .filter((v): v is BaseRegion => isBaseRegion(v));
  // 순서 고정: BASE_REGIONS 순
  return BASE_REGIONS.filter((r) => filtered.includes(r));
}

/** 상담폼에 실제로 보여줄 기본 지역 목록 */
export function resolveAllowedRegions(config: ManagedFormConfig): BaseRegion[] {
  if (!config.includeRegion) return [];
  if (!config.allowedRegions.length) return [...BASE_REGIONS];
  return config.allowedRegions;
}

export function normalizeFormConfig(raw: unknown): ManagedFormConfig {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const allowedRaw = src.allowedRegions ?? src.allowed_regions;
  return {
    includeRegion: readBool(src, "includeRegion", "include_region", true),
    allowedRegions: normalizeAllowedRegions(allowedRaw),
    includeAvailableTime: readBool(src, "includeAvailableTime", "include_available_time", true),
    allowRegionDetail: readBool(src, "allowRegionDetail", "allow_region_detail", true),
    includeAgeGroup: readBool(src, "includeAgeGroup", "include_age_group", true),
    includeJob: readBool(src, "includeJob", "include_job", true),
  };
}

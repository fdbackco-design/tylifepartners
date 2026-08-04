export type ManagedFormConfig = {
  /** 상담가능시간 필드 포함 여부 */
  includeAvailableTime: boolean;
  /** 지역 상세(구/시) 필수 드롭다운 노출 */
  allowRegionDetail: boolean;
  /** 연령대 필드 포함 */
  includeAgeGroup: boolean;
  /** 직업/직급 필드 포함 */
  includeJob: boolean;
};

export const DEFAULT_FORM_CONFIG: ManagedFormConfig = {
  includeAvailableTime: true,
  allowRegionDetail: true,
  includeAgeGroup: true,
  includeJob: true,
};

export function normalizeFormConfig(raw: unknown): ManagedFormConfig {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    includeAvailableTime:
      src.includeAvailableTime === undefined ? true : Boolean(src.includeAvailableTime),
    allowRegionDetail:
      src.allowRegionDetail === undefined ? true : Boolean(src.allowRegionDetail),
    includeAgeGroup: src.includeAgeGroup === undefined ? true : Boolean(src.includeAgeGroup),
    includeJob: src.includeJob === undefined ? true : Boolean(src.includeJob),
  };
}

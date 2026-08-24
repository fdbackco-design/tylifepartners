/** 고정 권역 및 고객 지역 → 권역 정규화 */

export const REGION_ZONES = [
  { name: "수도권", bases: ["서울", "인천", "경기"] as const },
  { name: "충청권", bases: ["대전", "세종", "충북", "충남"] as const },
  { name: "경상권", bases: ["부산", "대구", "울산", "경북", "경남"] as const },
  { name: "전라권", bases: ["광주", "전북", "전남"] as const },
  { name: "강원권", bases: ["강원"] as const },
  { name: "제주권", bases: ["제주"] as const },
] as const;

export type RegionZoneName = (typeof REGION_ZONES)[number]["name"];

export const REGION_ZONE_NAMES: RegionZoneName[] = REGION_ZONES.map((z) => z.name);

/** 권역별 포함 지역(표시용) */
export const ZONE_BASE_LABELS: Record<RegionZoneName, string[]> = Object.fromEntries(
  REGION_ZONES.map((z) => [z.name, [...z.bases]])
) as Record<RegionZoneName, string[]>;

const BASE_TO_ZONE: Record<string, RegionZoneName> = {};
for (const z of REGION_ZONES) {
  for (const b of z.bases) BASE_TO_ZONE[b] = z.name;
}

/** 긴 행정구역명 → 단축 시·도명 (긴 것 우선 매칭) */
const REGION_ALIASES: [string, string][] = [
  ["서울특별시", "서울"],
  ["인천광역시", "인천"],
  ["경기도", "경기"],
  ["대전광역시", "대전"],
  ["세종특별자치시", "세종"],
  ["세종시", "세종"],
  ["충청북도", "충북"],
  ["충청남도", "충남"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["울산광역시", "울산"],
  ["경상북도", "경북"],
  ["경상남도", "경남"],
  ["광주광역시", "광주"],
  ["전라북도", "전북"],
  ["전북특별자치도", "전북"],
  ["전라남도", "전남"],
  ["강원특별자치도", "강원"],
  ["강원도", "강원"],
  ["제주특별자치도", "제주"],
  ["제주도", "제주"],
  ["전남광주", "광주"],
];

REGION_ALIASES.sort((a, b) => b[0].length - a[0].length);

const BASES_BY_LENGTH = Object.keys(BASE_TO_ZONE).sort((a, b) => b.length - a.length);

export function isRegionZoneName(value: string | null | undefined): value is RegionZoneName {
  return REGION_ZONE_NAMES.includes(value as RegionZoneName);
}

/** 공백 제거·별칭 치환 후 시·도 단축명 추출 */
export function extractBaseRegion(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let compact = text.replace(/\s+/g, "");

  for (const [alias, base] of REGION_ALIASES) {
    if (compact.includes(alias)) {
      return base;
    }
  }

  for (const base of BASES_BY_LENGTH) {
    if (compact.includes(base)) return base;
  }
  return null;
}

/** 고객 지역 원문 → 고정 권역. 판단 불가 시 null */
export function resolveRegionZone(raw: string | null | undefined): RegionZoneName | null {
  const base = extractBaseRegion(raw);
  if (!base) return null;
  return BASE_TO_ZONE[base] ?? null;
}

/** assignment_rules.region_keywords 시드용 */
export function keywordsForZone(zone: RegionZoneName): string[] {
  const bases = ZONE_BASE_LABELS[zone];
  const extras: string[] = [];
  for (const [alias, base] of REGION_ALIASES) {
    if (bases.includes(base)) extras.push(alias);
  }
  return Array.from(new Set([...bases, ...extras]));
}

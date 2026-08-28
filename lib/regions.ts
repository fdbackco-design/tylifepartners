/** 상담 신청 기본 지역 + 상세 */
export const BASE_REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남광주",
  "경북",
  "경남",
  "제주",
] as const;

export type BaseRegion = (typeof BASE_REGIONS)[number];

export const REGION_DISTRICTS: Record<BaseRegion, readonly string[]> = {
  서울: [
    "종로구",
    "중구",
    "용산구",
    "성동구",
    "광진구",
    "동대문구",
    "중랑구",
    "성북구",
    "강북구",
    "도봉구",
    "노원구",
    "은평구",
    "서대문구",
    "마포구",
    "양천구",
    "강서구",
    "구로구",
    "금천구",
    "영등포구",
    "동작구",
    "관악구",
    "서초구",
    "강남구",
    "송파구",
    "강동구",
  ],
  부산: [
    "중구",
    "서구",
    "동구",
    "영도구",
    "부산진구",
    "동래구",
    "남구",
    "북구",
    "해운대구",
    "사하구",
    "금정구",
    "강서구",
    "연제구",
    "수영구",
    "사상구",
  ],
  대구: ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구"],
  인천: [
    "제물포구",
    "영종구",
    "미추홀구",
    "연수구",
    "남동구",
    "부평구",
    "계양구",
    "서해구",
    "검단구",
  ],
  대전: ["동구", "중구", "서구", "유성구", "대덕구"],
  울산: ["중구", "남구", "동구", "북구"],
  세종: ["세종시"],
  경기: [
    "수원시",
    "성남시",
    "의정부시",
    "안양시",
    "부천시",
    "광명시",
    "평택시",
    "동두천시",
    "안산시",
    "고양시",
    "과천시",
    "구리시",
    "남양주시",
    "오산시",
    "시흥시",
    "군포시",
    "의왕시",
    "하남시",
    "용인시",
    "파주시",
    "이천시",
    "안성시",
    "김포시",
    "화성시",
    "광주시",
    "양주시",
    "포천시",
    "여주시",
  ],
  강원: ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시"],
  충북: ["청주시", "충주시", "제천시"],
  충남: ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시"],
  전북: ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시"],
  전남광주: [
    "목포시",
    "여수시",
    "순천시",
    "나주시",
    "광양시",
    "동구",
    "서구",
    "남구",
    "북구",
    "광산구",
  ],
  경북: [
    "포항시",
    "경주시",
    "김천시",
    "안동시",
    "구미시",
    "영주시",
    "영천시",
    "상주시",
    "문경시",
    "경산시",
  ],
  경남: ["창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시"],
  제주: ["제주시", "서귀포시"],
};

export function isBaseRegion(value: string): value is BaseRegion {
  return (BASE_REGIONS as readonly string[]).includes(value);
}

export function getDistrictsForRegion(region: string): readonly string[] {
  if (!isBaseRegion(region)) return [];
  return REGION_DISTRICTS[region];
}

/** DB/시트 저장용: 상세가 있으면 "서울 강남구" */
export function formatRegionValue(region: string, district?: string | null): string {
  const r = region.trim();
  const d = (district ?? "").trim();
  if (!r) return "";
  if (!d) return r;
  return `${r} ${d}`;
}

/** "서울 강남구" / "서울" 에서 기본 지역 추출 */
export function parseBaseRegion(regionValue: string): BaseRegion | null {
  const t = regionValue.trim();
  if (!t) return null;
  if (isBaseRegion(t)) return t;
  const first = t.split(/\s+/)[0] ?? "";
  return isBaseRegion(first) ? first : null;
}

/** 랜딩·자동분배 UI 공통 권역 그룹 */
export const REGION_GROUPS: { zone: string; regions: BaseRegion[] }[] = [
  { zone: "수도권", regions: ["서울", "인천", "경기"] },
  { zone: "충청권", regions: ["대전", "세종", "충북", "충남"] },
  { zone: "경상권", regions: ["부산", "대구", "울산", "경북", "경남"] },
  { zone: "전라권", regions: ["전북", "전남광주"] },
  { zone: "강원권", regions: ["강원"] },
  { zone: "제주권", regions: ["제주"] },
];

export function regionKeywordLabel(base: string, district?: string | null): string {
  return formatRegionValue(base, district);
}

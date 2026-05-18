export type LandingKey =
  | "parent_main"
  | "parent_v1"
  | "parent_v2"
  | "parent_v3"
  | "me"
  | "business"
  | "no_clawback"
  | "sidejob";

export type LandingSection = {
  name: string;
  label: string;
  start: number;
  end: number;
  memo?: string;
};

export const LANDING_KEYS: LandingKey[] = [
  "parent_main",
  "parent_v1",
  "parent_v2",
  "parent_v3",
  "me",
  "business",
  "no_clawback",
  "sidejob",
];

export const LANDING_SECTIONS: Record<LandingKey, LandingSection[]> = {
  parent_main: [
    { name: "section_01", label: "1. 메인 후킹", start: 0.0, end: 0.1003, memo: "첫 화면, 핵심 카피" },
    { name: "section_02", label: "2. 상급병원 진료 예약", start: 0.1003, end: 0.2711, memo: "핵심 기능" },
    { name: "section_03", label: "3. 4가지 케어 시스템", start: 0.2711, end: 0.453, memo: "서비스/상품 설명" },
    { name: "section_04", label: "4. 혜택 설명", start: 0.4, end: 0.58, memo: "혜택, 장점" },
    { name: "section_05", label: "5. 병원 설명", start: 0.58, end: 0.631, memo: "신뢰 확보" },
    { name: "section_06", label: "6. 전액 환급", start: 0.631, end: 0.7263, memo: "환급" },
    { name: "section_07", label: "7. 라이프 서비스", start: 0.7263, end: 0.8198, memo: "라이프 서비스" },
    { name: "section_08", label: "8. 최종 CTA", start: 0.7263, end: 1.0, memo: "FAQ, 최종 CTA" },
  ],
  parent_v1: [
    { name: "section_01", label: "1. 메인 후킹", start: 0.0, end: 0.1366 },
    { name: "section_02", label: "2. 핵심 기능", start: 0.1366, end: 0.269 },
    { name: "section_03", label: "3. 4가지 케어 시스템", start: 0.269, end: 0.4442 },
    { name: "section_04", label: "4. 병원 설명", start: 0.4442, end: 0.6249 },
    { name: "section_05", label: "5. 환급", start: 0.6249, end: 0.7147 },
    { name: "section_06", label: "6. 라이프 서비스", start: 0.7147, end: 0.8128 },
    { name: "section_07", label: "7. FAQ/마무리", start: 0.8128, end: 1.0 },
  ],
  parent_v2: [
    { name: "section_01", label: "1. 메인 후킹", start: 0.0, end: 0.1047 },
    { name: "section_02", label: "2. 핵심 기능", start: 0.1047, end: 0.2861 },
    { name: "section_03", label: "3. 4가지 케어 시스템", start: 0.2861, end: 0.4674 },
    { name: "section_04", label: "4. 전담 간호사", start: 0.4674, end: 0.59 },
    { name: "section_05", label: "5. 환급", start: 0.59, end: 0.6905 },
    { name: "section_06", label: "6. 라이프 서비스", start: 0.6905, end: 0.7918 },
    { name: "section_07", label: "7. FAQ/마무리", start: 0.7918, end: 1.0 },
  ],
  parent_v3: [
    { name: "section_01", label: "1. 메인 후킹", start: 0.0, end: 0.0974 },
    { name: "section_02", label: "2. 핵심 기능", start: 0.0974, end: 0.2607 },
    { name: "section_03", label: "3. 4가지 케어 시스템", start: 0.2607, end: 0.4468 },
    { name: "section_04", label: "4. 갤럭시핏", start: 0.42, end: 0.6249 },
    { name: "section_05", label: "5. 환급", start: 0.6249, end: 0.7043 },
    { name: "section_06", label: "6. 라이프 서비스", start: 0.7043, end: 0.8142 },
    { name: "section_07", label: "7. FAQ/마무리", start: 0.8142, end: 1.0 },
  ],
  me: [
    { name: "section_01", label: "1. 메인 후킹", start: 0.0, end: 0.1366 },
    { name: "section_02", label: "2. 핵심 기능", start: 0.1366, end: 0.269 },
    { name: "section_03", label: "3. 4가지 케어 시스템", start: 0.269, end: 0.4442 },
    { name: "section_04", label: "4. 병원 설명", start: 0.4442, end: 0.6249 },
    { name: "section_05", label: "5. 환급", start: 0.6249, end: 0.7147 },
    { name: "section_06", label: "6. 라이프 서비스", start: 0.7147, end: 0.8128 },
    { name: "section_07", label: "7. FAQ/마무리", start: 0.8128, end: 1.0 },
  ],
  business: [
    { name: "section_01", label: "1. B2B 메인 제안", start: 0.0, end: 0.1236 },
    { name: "section_02", label: "2. 약속 4가지", start: 0.1236, end: 0.2643 },
    { name: "section_03", label: "3. 기존과 비교", start: 0.2643, end: 0.3772 },
    { name: "section_04", label: "4. 갤럭시케어", start: 0.3772, end: 0.4885 },
    { name: "section_05", label: "5. 4가지 코어 서비스", start: 0.4885, end: 0.5935 },
    { name: "section_06", label: "6. 병원 예약", start: 0.5935, end: 0.7229 },
    { name: "section_07", label: "7. 납입금 환급", start: 0.7229, end: 0.782 },
    { name: "section_08", label: "8. 라이프케어", start: 0.782, end: 0.8537 },
    { name: "section_09", label: "9. 회사 신뢰", start: 0.8537, end: 1.0 },
  ],
  no_clawback: [
    { name: "section_01", label: "1. B2B 메인 제안", start: 0.0, end: 0.1616 },
    { name: "section_02", label: "2. 현영 겔럭시케어", start: 0.1616, end: 0.4821 },
    { name: "section_03", label: "3. 기존과 차이", start: 0.4821, end: 0.9249 },
    { name: "section_04", label: "4. 상담 버튼", start: 0.9249, end: 1.0 },
  ],
  sidejob: [
    { name: "section_01", label: "1. 부업 메인 후킹", start: 0.0, end: 0.3933 },
    { name: "section_02", label: "2. 특별한 이유", start: 0.3933, end: 0.6482 },
    { name: "section_03", label: "3. 회사 신뢰", start: 0.6482, end: 0.8987 },
    { name: "section_04", label: "4. FAQ/마무리", start: 0.8987, end: 1.0 },
  ],
};

export const DEFAULT_LANDING_SECTIONS: LandingSection[] = [
  { name: "section_01", label: "1. 상단", start: 0.0, end: 0.2 },
  { name: "section_02", label: "2. 중상단", start: 0.2, end: 0.4 },
  { name: "section_03", label: "3. 중단", start: 0.4, end: 0.6 },
  { name: "section_04", label: "4. 중하단", start: 0.6, end: 0.8 },
  { name: "section_05", label: "5. 하단", start: 0.8, end: 1.0 },
];

export function getLandingSections(landingKey: string): LandingSection[] {
  return LANDING_SECTIONS[landingKey as LandingKey] ?? DEFAULT_LANDING_SECTIONS;
}

export function getLandingSectionByRatio(
  landingKey: string,
  yRatio: number
): LandingSection | null {
  const sections = getLandingSections(landingKey);
  return (
    sections.find((section) => yRatio >= section.start && yRatio < section.end) ??
    sections[sections.length - 1] ??
    null
  );
}

export const LANDING_KEY_LABELS: Record<LandingKey, string> = {
  parent_main: "/ (메인)",
  parent_v1: "/v1",
  parent_v2: "/v2",
  parent_v3: "/v3",
  me: "/me",
  business: "/business",
  no_clawback: "/no-clawback",
  sidejob: "/sidejob",
};

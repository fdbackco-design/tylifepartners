/**
 * UTM 추적 구조
 * 플랫폼별 utm_source, utm_medium 정의 및 링크 생성
 */

export type UTMPlatform =
  | "youtube"
  | "naver_shorts"
  | "instagram"
  | "tiktok"
  | "kakao_openchat"
  | "daangn"
  | "threads"
  | "facebook"
  | "naver_blog"
  | "band";

export const UTM_PLATFORMS: Record<UTMPlatform, { source: string; medium: string; label: string }> = {
  youtube: { source: "youtube", medium: "social", label: "유튜브" },
  naver_shorts: { source: "naver_shorts", medium: "social", label: "네이버 숏츠" },
  instagram: { source: "instagram", medium: "social", label: "인스타그램" },
  tiktok: { source: "tiktok", medium: "social", label: "틱톡" },
  kakao_openchat: { source: "kakao_openchat", medium: "social", label: "카카오톡 오픈채팅방" },
  daangn: { source: "daangn", medium: "social", label: "당근마켓" },
  threads: { source: "threads", medium: "social", label: "스레드" },
  facebook: { source: "facebook", medium: "social", label: "페이스북" },
  naver_blog: { source: "naver_blog", medium: "referral", label: "네이버 블로그" },
  band: { source: "band", medium: "social", label: "밴드" },
};

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/**
 * URL 쿼리에서 UTM 파라미터 추출
 */
export function parseUTMFromUrl(search: string = ""): UTMParams {
  if (typeof window !== "undefined" && !search) {
    search = window.location.search;
  }
  const params = new URLSearchParams(search);
  const utm: UTMParams = {};
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  const utmCampaign = params.get("utm_campaign");
  const utmContent = params.get("utm_content");
  const utmTerm = params.get("utm_term");
  if (utmSource) utm.utm_source = utmSource;
  if (utmMedium) utm.utm_medium = utmMedium;
  if (utmCampaign) utm.utm_campaign = utmCampaign;
  if (utmContent) utm.utm_content = utmContent;
  if (utmTerm) utm.utm_term = utmTerm;
  return utm;
}

/**
 * 플랫폼별 UTM 링크 생성
 * @param baseUrl 사이트 기본 URL (예: https://www.tylifepartners.com)
 * @param path 경로 (예: /, /me, /business)
 * @param platform 플랫폼 키
 * @param campaign 캠페인명 (선택)
 * @param content 콘텐츠 구분 (선택)
 */
export function buildUTMLink(
  baseUrl: string,
  path: string,
  platform: UTMPlatform,
  campaign?: string,
  content?: string
): string {
  const p = UTM_PLATFORMS[platform];
  const url = new URL(path, baseUrl.replace(/\/$/, ""));
  url.searchParams.set("utm_source", p.source);
  url.searchParams.set("utm_medium", p.medium);
  if (campaign) url.searchParams.set("utm_campaign", campaign);
  if (content) url.searchParams.set("utm_content", content);
  return url.toString();
}

/**
 * 모든 플랫폼별 UTM 링크 한번에 생성
 */
export function buildAllPlatformLinks(
  baseUrl: string,
  path: string = "/",
  campaign?: string
): { platform: UTMPlatform; label: string; url: string }[] {
  return (Object.keys(UTM_PLATFORMS) as UTMPlatform[]).map((platform) => ({
    platform,
    label: UTM_PLATFORMS[platform].label,
    url: buildUTMLink(baseUrl, path, platform, campaign),
  }));
}

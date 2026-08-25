/**
 * UTM + Meta 광고 추적 파라미터
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
  /** Meta Ads URL 파라미터 / 동적 매크로 {{ad.id}} */
  meta_ad_id?: string;
  meta_adset_id?: string;
  meta_campaign_id?: string;
}

/** Meta 광고·광고세트·캠페인 ID로 쓸 수 있는 숫자 문자열 */
export function isLikelyMetaObjectId(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim();
  return /^\d{5,30}$/.test(s);
}

function firstParam(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = params.get(key)?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * URL 쿼리에서 UTM + Meta 광고 ID 추출
 * 권장 광고 URL 예시:
 *   ...?utm_source=facebook&utm_content={{ad.id}}&ad_id={{ad.id}}&adset_id={{adset.id}}&campaign_id={{campaign.id}}
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

  const adId =
    firstParam(params, ["ad_id", "adid", "fb_ad_id"]) ||
    (isLikelyMetaObjectId(utmContent) ? String(utmContent).trim() : undefined);
  const adsetId = firstParam(params, ["adset_id", "adsetid", "fb_adset_id"]);
  const campaignId =
    firstParam(params, ["campaign_id", "campaignid", "fb_campaign_id"]) ||
    (isLikelyMetaObjectId(utmCampaign) ? String(utmCampaign).trim() : undefined);

  if (adId && isLikelyMetaObjectId(adId)) utm.meta_ad_id = adId;
  if (adsetId && isLikelyMetaObjectId(adsetId)) utm.meta_adset_id = adsetId;
  if (campaignId && isLikelyMetaObjectId(campaignId)) utm.meta_campaign_id = campaignId;

  return utm;
}

/** 상담 신청 body에 넣을 attribution 필드 */
export function attributionFieldsFromUtm(utm: UTMParams): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
} {
  return {
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    utm_content: utm.utm_content || null,
    utm_term: utm.utm_term || null,
    meta_ad_id: utm.meta_ad_id || null,
    meta_adset_id: utm.meta_adset_id || null,
    meta_campaign_id: utm.meta_campaign_id || null,
  };
}

/** API body에서 Meta 광고 ID 정규화 (meta_* 또는 ad_id 별칭) */
export function parseMetaIdsFromBody(
  body: Record<string, unknown>,
  fallbacks?: { utm_content?: string | null; utm_campaign?: string | null }
): {
  meta_ad_id: string | null;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
} {
  const pick = (...vals: unknown[]): string | null => {
    for (const v of vals) {
      if (v == null) continue;
      const s = String(v).trim();
      if (isLikelyMetaObjectId(s)) return s;
    }
    return null;
  };
  return {
    meta_ad_id: pick(body.meta_ad_id, body.ad_id, body.adid, fallbacks?.utm_content),
    meta_adset_id: pick(body.meta_adset_id, body.adset_id, body.adsetid),
    meta_campaign_id: pick(body.meta_campaign_id, body.campaign_id, body.campaignid, fallbacks?.utm_campaign),
  };
}

/**
 * 플랫폼별 UTM 링크 생성
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

export function buildAllPlatformLinks(
  baseUrl: string,
  path: string = "/",
  campaign?: string,
  content?: string
): { platform: UTMPlatform; label: string; url: string }[] {
  return (Object.keys(UTM_PLATFORMS) as UTMPlatform[]).map((platform) => ({
    platform,
    label: UTM_PLATFORMS[platform].label,
    url: buildUTMLink(baseUrl, path, platform, campaign, content),
  }));
}

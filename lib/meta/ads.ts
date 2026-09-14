import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyMetaObjectId } from "@/lib/utm";

const GRAPH_VERSION = "v21.0";
/** 메타데이터 캐시 (이름·타입 등) */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Meta CDN 서명 URL은 수 시간~수일 내 만료 → 짧게 유지하고 프록시에서 재발급 */
const CDN_URL_TTL_MS = 6 * 60 * 60 * 1000;

export type MetaCreativeCache = {
  ad_id: string;
  ad_name: string | null;
  creative_id: string | null;
  creative_type: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  video_id: string | null;
  permalink_url: string | null;
  fetch_status: "ok" | "error" | "missing_token" | "not_found";
  fetch_error: string | null;
  fetched_at: string;
};

/** Page/Lead Ads용 토큰 (leads_retrieval 등) */
export function getMetaAccessToken(): string | null {
  const t = String(process.env.META_ACCESS_TOKEN ?? "").trim();
  return t || null;
}

/**
 * Marketing API(광고 소재·Insights)용 토큰.
 * System User `ads_read` 권한 토큰을 META_ADS_ACCESS_TOKEN 에 두고,
 * Page 토큰은 META_ACCESS_TOKEN 에 분리하는 것을 권장.
 */
export function getMetaAdsAccessToken(): string | null {
  const ads = String(process.env.META_ADS_ACCESS_TOKEN ?? "").trim();
  if (ads) return ads;
  return getMetaAccessToken();
}

/** act_123 또는 123 → act_123 */
export function normalizeMetaAdAccountId(raw?: string | null): string | null {
  const v = String(raw ?? process.env.META_AD_ACCOUNT_ID ?? "")
    .trim()
    .replace(/^act_/i, "");
  if (!v || !/^\d+$/.test(v)) return null;
  return `act_${v}`;
}

function accessToken(): string | null {
  return getMetaAdsAccessToken();
}

function pageAccessToken(): string | null {
  return getMetaAccessToken();
}

export function isMetaAdsConfigured(): boolean {
  return Boolean(getMetaAdsAccessToken());
}

export function pickMetaAdId(opts: {
  meta_ad_id?: string | null;
  utm_content?: string | null;
}): string | null {
  if (isLikelyMetaObjectId(opts.meta_ad_id)) return String(opts.meta_ad_id).trim();
  if (isLikelyMetaObjectId(opts.utm_content)) return String(opts.utm_content).trim();
  return null;
}

/** 목록·확대용 CDN URL 선택 (프록시 내부) */
export function pickMetaCreativeMediaUrl(
  row: Pick<MetaCreativeCache, "image_url" | "thumbnail_url">,
  full?: boolean
): string | null {
  if (full) return row.image_url || row.thumbnail_url || null;
  return row.image_url || row.thumbnail_url || null;
}

function isMetaCdnUrl(url: string | null | undefined): boolean {
  return /fbcdn\.net|scontent[^/]*\.xx\.fbcdn|facebook\.com\//i.test(String(url ?? ""));
}

/** 관리자 목록/확대용 — 동일 출처 프록시 (CDN 만료 시 서버에서 재발급) */
export function metaCreativeImageProxyPath(
  adId: string,
  opts?: { full?: boolean; bust?: string | number; slide?: number }
): string {
  const q = new URLSearchParams({ ad_id: String(adId).trim() });
  if (opts?.full) q.set("full", "1");
  if (opts?.bust != null && String(opts.bust)) q.set("t", String(opts.bust));
  if (opts?.slide != null && Number.isFinite(opts.slide) && opts.slide >= 0) {
    q.set("slide", String(Math.floor(opts.slide)));
  }
  return `/api/admin/meta/creative-image?${q.toString()}`;
}

async function graphGet(
  path: string,
  fields: string,
  extraParams?: Record<string, string>
): Promise<{ ok: true; data: any } | { ok: false; status: number; message: string }> {
  return graphGetWithToken(path, fields, accessToken(), extraParams);
}

async function graphGetWithToken(
  path: string,
  fields: string,
  token: string | null,
  extraParams?: Record<string, string>
): Promise<{ ok: true; data: any } | { ok: false; status: number; message: string }> {
  if (!token) return { ok: false, status: 0, message: "META_ADS_ACCESS_TOKEN(또는 META_ACCESS_TOKEN) 미설정" };
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  url.searchParams.set("fields", fields);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  }
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json?.error?.message ?? res.statusText ?? "Meta API error");
    return { ok: false, status: res.status, message: msg };
  }
  return { ok: true, data: json };
}

function mapCreativeType(creative: any): string {
  if (!creative) return "unknown";
  const children = creative?.object_story_spec?.link_data?.child_attachments;
  if (Array.isArray(children) && children.length > 1) return "carousel";
  if (creative.video_id || creative?.object_story_spec?.video_data?.video_id) return "video";
  const feedVideos = creative?.asset_feed_spec?.videos;
  if (Array.isArray(feedVideos) && feedVideos.length) return "video";
  if (creative.image_url || creative.thumbnail_url || creative.image_hash) return "image";
  const ot = String(creative.object_type ?? "").toLowerCase();
  if (ot.includes("video")) return "video";
  if (ot.includes("image") || ot.includes("photo") || ot.includes("share")) return "image";
  return ot || "unknown";
}

function firstNonEmpty(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

/** Lead Ads / Instant Form / 카드뉴스(carousel) 포함 — creative 중첩 스펙에서 이미지 URL·hash 추출 */
export function extractCreativeMedia(creative: any): {
  image_url: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  image_hash: string | null;
  story_id: string | null;
} {
  const oss = creative?.object_story_spec ?? {};
  const link = oss.link_data ?? {};
  const photo = oss.photo_data ?? {};
  const video = oss.video_data ?? {};
  const feed = creative?.asset_feed_spec ?? {};
  const feedImage = Array.isArray(feed.images) ? feed.images[0] : null;
  const feedVideo = Array.isArray(feed.videos) ? feed.videos[0] : null;
  const child = Array.isArray(link.child_attachments) ? link.child_attachments[0] : null;

  const image_hash = firstNonEmpty(
    creative?.image_hash,
    link.image_hash,
    child?.image_hash,
    photo.image_hash,
    feedImage?.hash
  );
  // creative.image_url 은 Lead Ads SHARE/카드뉴스에서 Graph가 필드 자체를 거부하는 경우가 있어 요청하지 않음.
  // 응답에 있으면 사용.
  const image_url = firstNonEmpty(
    creative?.image_url,
    link.picture,
    link.image_url,
    child?.picture,
    photo.url,
    photo.picture,
    video.image_url,
    feedImage?.url
  );
  const thumbnail_url = firstNonEmpty(creative?.thumbnail_url, image_url);
  const video_id = firstNonEmpty(creative?.video_id, video.video_id, feedVideo?.video_id);
  const story_id = firstNonEmpty(
    creative?.effective_object_story_id,
    creative?.object_story_id
  );

  return { image_url, thumbnail_url, video_id, image_hash, story_id };
}

async function resolveImageHashUrl(imageHash: string): Promise<string | null> {
  const accountId = normalizeMetaAdAccountId();
  if (!accountId) return null;
  const result = await graphGet(
    `${accountId}/adimages`,
    "hash,url,permalink_url",
    { hashes: `["${imageHash}"]` }
  );
  if (!result.ok) {
    console.warn("[meta/ads] adimages lookup failed:", result.message);
    return null;
  }
  const data = result.data?.data;
  if (!Array.isArray(data) || !data.length) return null;
  const row = data.find((d: any) => String(d.hash) === imageHash) ?? data[0];
  return firstNonEmpty(row?.url, row?.permalink_url);
}

async function resolveStoryPicture(storyId: string): Promise<string | null> {
  const result = await graphGet(storyId, "full_picture,picture");
  if (result.ok) {
    return firstNonEmpty(result.data?.full_picture, result.data?.picture);
  }
  // ads_read System User 로는 Page post picture가 거절되는 경우가 많아 Page 토큰으로 재시도
  const pageToken = pageAccessToken();
  const adsToken = accessToken();
  if (pageToken && pageToken !== adsToken) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${storyId.replace(/^\//, "")}`);
    url.searchParams.set("fields", "full_picture,picture");
    url.searchParams.set("access_token", pageToken);
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      return firstNonEmpty(json?.full_picture, json?.picture);
    }
    console.warn("[meta/ads] story picture failed (page token):", storyId, json?.error?.message ?? res.statusText);
  } else {
    console.warn("[meta/ads] story picture failed:", storyId, result.message);
  }
  return null;
}

async function upsertCreativeCache(row: MetaCreativeCache, extra?: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("meta_ad_creatives").upsert({
    ...row,
    updated_at: new Date().toISOString(),
    ...extra,
  });
  if (error) {
    console.warn("[meta/ads] creative cache upsert skipped:", error.message);
  }
}

/** Marketing API로 광고 소재를 조회하고 DB에 캐시 (Lead Ads 중첩 이미지 포함) */
export async function fetchAndCacheMetaAdCreative(adId: string): Promise<MetaCreativeCache> {
  const id = String(adId).trim();
  const now = new Date().toISOString();

  if (!accessToken()) {
    const row: MetaCreativeCache = {
      ad_id: id,
      ad_name: null,
      creative_id: null,
      creative_type: null,
      thumbnail_url: null,
      image_url: null,
      video_id: null,
      permalink_url: null,
      fetch_status: "missing_token",
      fetch_error: "META_ADS_ACCESS_TOKEN(또는 META_ACCESS_TOKEN) 미설정",
      fetched_at: now,
    };
    await upsertCreativeCache(row);
    return row;
  }

  // Lead Form/카드뉴스: creative.image_url 필드를 요청하면 Graph가 전체 조회를 실패시키는 경우가 있음
  // → thumbnail_url + image_hash + child_attachments + story 로 해석
  const result = await graphGet(
    id,
    [
      "id,",
      "name,",
      "creative{",
      "id,name,thumbnail_url,image_hash,video_id,object_type,",
      "effective_object_story_id,object_story_id,",
      "object_story_spec{",
      "link_data{image_hash,picture,link,name,message,child_attachments{image_hash,picture,name}},",
      "photo_data{image_hash,url,picture},",
      "video_data{video_id,image_hash}",
      "},",
      "asset_feed_spec{images{hash,url},videos{video_id}}",
      "}",
    ].join(""),
    { thumbnail_width: "600", thumbnail_height: "600" }
  );

  if (!result.ok) {
    const status = result.status === 404 ? "not_found" : "error";
    const row: MetaCreativeCache = {
      ad_id: id,
      ad_name: null,
      creative_id: null,
      creative_type: null,
      thumbnail_url: null,
      image_url: null,
      video_id: null,
      permalink_url: null,
      fetch_status: status,
      fetch_error: result.message,
      fetched_at: now,
    };
    await upsertCreativeCache(row, { raw: { error: result.message } });
    console.error("[meta/ads] ad creative fetch failed:", { adId: id, status: result.status, message: result.message });
    return row;
  }

  const creative = result.data?.creative ?? null;
  const media = extractCreativeMedia(creative);
  let imageUrl: string | null = null;
  let thumbUrl: string | null = null;
  let usedHash = false;
  let usedStory = false;

  // image_hash → adimages URL 우선 (카드뉴스 등에서 thumbnail CDN만 쓰면 빨리 만료됨)
  if (media.image_hash) {
    const fromHash = await resolveImageHashUrl(media.image_hash);
    if (fromHash) {
      imageUrl = fromHash;
      thumbUrl = fromHash;
      usedHash = true;
    }
  }
  if (!imageUrl) {
    imageUrl = media.image_url;
    thumbUrl = media.thumbnail_url || media.image_url;
  }
  if (!imageUrl && !thumbUrl && media.story_id) {
    const storyPic = await resolveStoryPicture(media.story_id);
    if (storyPic) {
      imageUrl = storyPic;
      thumbUrl = storyPic;
      usedStory = true;
    }
  }

  const row: MetaCreativeCache = {
    ad_id: id,
    ad_name: result.data?.name ? String(result.data.name) : null,
    creative_id: creative?.id ? String(creative.id) : null,
    creative_type: mapCreativeType(creative),
    thumbnail_url: thumbUrl,
    image_url: imageUrl,
    video_id: media.video_id,
    permalink_url: null,
    fetch_status: "ok",
    fetch_error: imageUrl || thumbUrl ? null : "creative has no resolvable image",
    fetched_at: now,
  };
  await upsertCreativeCache(row, { raw: result.data });
  console.info("[meta/ads] creative cached:", {
    adId: id,
    hasImage: Boolean(imageUrl || thumbUrl),
    creativeType: row.creative_type,
    usedHash,
    usedStory,
  });
  return row;
}

async function getCached(adId: string): Promise<MetaCreativeCache | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("meta_ad_creatives").select("*").eq("ad_id", adId).maybeSingle();
  if (error || !data) return null;
  return data as MetaCreativeCache;
}

function isFresh(row: MetaCreativeCache): boolean {
  const t = new Date(row.fetched_at).getTime();
  if (Number.isNaN(t)) return false;
  if (row.fetch_status === "missing_token") return false;
  if (row.fetch_status === "error") return Date.now() - t < 60 * 60 * 1000; // 오류는 1시간 캐시
  // Lead Ads 등: ok인데 이미지가 비어 있으면 재조회 (이전 얕은 필드 캐시 무효)
  if (row.fetch_status === "ok" && !row.image_url && !row.thumbnail_url) return false;
  const ttl =
    isMetaCdnUrl(row.image_url) || isMetaCdnUrl(row.thumbnail_url) ? CDN_URL_TTL_MS : CACHE_TTL_MS;
  return Date.now() - t < ttl;
}

function hasPreview(row: MetaCreativeCache): boolean {
  return Boolean(row.image_url || row.thumbnail_url);
}

/** 캐시 우선, 만료/없음이면 API 조회 */
export async function resolveMetaAdCreative(adId: string): Promise<MetaCreativeCache> {
  const cached = await getCached(adId);
  if (cached && isFresh(cached)) return cached;
  return fetchAndCacheMetaAdCreative(adId);
}

export type MetaCreativeAttach = {
  meta_ad_id: string | null;
  meta_ad_name: string | null;
  meta_creative_type: string | null;
  meta_creative_preview: string | null;
  /** 클릭 확대용 원본(또는 최대 해상도) URL */
  meta_creative_full: string | null;
  meta_creative_status: string | null;
};

export type MetaCreativeViewerSlide = {
  index: number;
  label: string;
  src: string;
};

export type MetaCreativeViewer = {
  ad_id: string;
  ad_name: string | null;
  kind: "image" | "video" | "carousel";
  slides: MetaCreativeViewerSlide[];
  /** 동일 출처 프록시 <video src> — source 확보된 경우만 */
  video_src: string | null;
  /** Facebook video plugin iframe — source 없을 때 폴백 */
  video_embed_src: string | null;
  poster: string | null;
  video_message: string | null;
};

type CachedCreativeRow = MetaCreativeCache & { raw?: unknown };

function carouselAttachmentsFromRaw(raw: unknown): Array<{ image_hash?: string; picture?: string; name?: string }> {
  const creative = (raw as { creative?: unknown } | null)?.creative as Record<string, unknown> | null | undefined;
  const oss = (creative?.object_story_spec as Record<string, unknown> | undefined) ?? {};
  const link = (oss.link_data as Record<string, unknown> | undefined) ?? {};
  const children = link.child_attachments;
  return Array.isArray(children) ? (children as Array<{ image_hash?: string; picture?: string; name?: string }>) : [];
}

async function getCachedWithRaw(adId: string): Promise<CachedCreativeRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("meta_ad_creatives").select("*").eq("ad_id", adId).maybeSingle();
  if (error || !data) return null;
  return data as CachedCreativeRow;
}

/** 확대 모달용 — 카드뉴스 슬라이드·영상 소스 포함 */
export async function getMetaCreativeViewer(adId: string): Promise<MetaCreativeViewer> {
  const id = String(adId).trim();
  let row = await getCachedWithRaw(id);
  if (!row || !isFresh(row) || (!row.image_url && !row.thumbnail_url && !row.video_id)) {
    await fetchAndCacheMetaAdCreative(id);
    row = await getCachedWithRaw(id);
  }
  if (!row) {
    return {
      ad_id: id,
      ad_name: null,
      kind: "image",
      slides: [],
      video_src: null,
      video_embed_src: null,
      poster: null,
      video_message: null,
    };
  }

  const attachments = carouselAttachmentsFromRaw(row.raw);
  const type = String(row.creative_type || "").toLowerCase();
  const isCarousel = type === "carousel" || attachments.length > 1;
  const isVideo = type === "video" || Boolean(row.video_id);

  const poster = hasPreview(row) ? metaCreativeImageProxyPath(id, { full: true }) : null;
  const slides: MetaCreativeViewerSlide[] = [];

  if (isCarousel && attachments.length > 1) {
    for (let i = 0; i < attachments.length; i++) {
      const a = attachments[i];
      slides.push({
        index: i,
        label: String(a?.name ?? `카드 ${i + 1}`).trim() || `카드 ${i + 1}`,
        src: metaCreativeImageProxyPath(id, { full: true, slide: i }),
      });
    }
  } else if (poster) {
    slides.push({ index: 0, label: row.ad_name || "소재", src: poster });
  }

  let video_src: string | null = null;
  let video_embed_src: string | null = null;
  let video_message: string | null = null;

  if (isVideo) {
    const playback = await resolveMetaCreativeVideoPlayback(id);
    if (playback.sourceUrl) {
      video_src = `/api/admin/meta/creative-video?ad_id=${encodeURIComponent(id)}`;
    }
    video_embed_src = playback.embedSrc;
    if (!video_src && !video_embed_src) {
      video_message =
        "이 광고 영상은 Meta API에서 재생 주소(source)를 주지 않습니다. Ads 권한(ads_management) 또는 페이지 토큰을 확인하거나, 썸네일로만 확인하세요.";
    }
  }

  return {
    ad_id: id,
    ad_name: row.ad_name,
    kind: isCarousel ? "carousel" : isVideo ? "video" : "image",
    slides,
    video_src,
    video_embed_src,
    poster,
    video_message,
  };
}

/** 카드뉴스 N번째 이미지의 업스트림 URL */
export async function resolveMetaCreativeSlideUpstreamUrl(
  adId: string,
  slideIndex: number
): Promise<string | null> {
  const id = String(adId).trim();
  let row = await getCachedWithRaw(id);
  if (!row?.raw) {
    await fetchAndCacheMetaAdCreative(id);
    row = await getCachedWithRaw(id);
  }
  const attachments = carouselAttachmentsFromRaw(row?.raw);
  if (slideIndex < 0 || slideIndex >= attachments.length) {
    return row?.image_url || row?.thumbnail_url || null;
  }
  const slide = attachments[slideIndex];
  const hash = firstNonEmpty(slide?.image_hash);
  if (hash) {
    const fromHash = await resolveImageHashUrl(hash);
    if (fromHash) return fromHash;
  }
  return firstNonEmpty(slide?.picture) || row?.image_url || row?.thumbnail_url || null;
}

function storyIdFromRaw(raw: unknown): string | null {
  const creative = (raw as { creative?: Record<string, unknown> } | null)?.creative;
  if (!creative) return null;
  return firstNonEmpty(creative.effective_object_story_id, creative.object_story_id);
}

function facebookVideoEmbedSrc(permalinkOrWatchUrl: string): string {
  const href = encodeURIComponent(permalinkOrWatchUrl);
  // 숏폼(9:16)에 맞춰 세로 플레이어 크기 요청
  return `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=420&height=746&allowfullscreen=true`;
}

async function resolveStoryVideoSource(storyId: string): Promise<string | null> {
  const fields =
    "attachments{media_type,type,url,media{source,image},target{id}},source,permalink_url";
  const tokens = Array.from(
    new Set([pageAccessToken(), accessToken()].filter((t): t is string => Boolean(t)))
  );
  for (const token of tokens) {
    const result = await graphGetWithToken(storyId, fields, token);
    if (!result.ok) {
      console.warn("[meta/ads] story video failed:", storyId, result.message);
      continue;
    }
    const direct = firstNonEmpty(result.data?.source);
    if (direct) return direct;
    const atts = result.data?.attachments?.data;
    if (Array.isArray(atts)) {
      for (const att of atts) {
        const mediaType = String(att?.media_type ?? att?.type ?? "").toLowerCase();
        const src = firstNonEmpty(att?.media?.source);
        if (src) return src;
        if (mediaType.includes("video")) {
          const url = firstNonEmpty(att?.url, att?.media?.image?.src);
          if (url && /\.mp4(\?|$)/i.test(url)) return url;
        }
      }
      // 서브첨부 (공유/앨범)
      for (const att of atts) {
        const sub = att?.subattachments?.data;
        if (!Array.isArray(sub)) continue;
        for (const s of sub) {
          const src = firstNonEmpty(s?.media?.source);
          if (src) return src;
        }
      }
    }
  }
  return null;
}

type VideoPlayback = {
  sourceUrl: string | null;
  embedSrc: string | null;
  permalink: string | null;
};

/** 재생 가능한 mp4 source + Facebook embed 폴백을 함께 조회 */
export async function resolveMetaCreativeVideoPlayback(adId: string): Promise<VideoPlayback> {
  const id = String(adId).trim();
  let row = await getCachedWithRaw(id);
  if (!row?.video_id && !storyIdFromRaw(row?.raw)) {
    await fetchAndCacheMetaAdCreative(id);
    row = await getCachedWithRaw(id);
  }

  const videoId = firstNonEmpty(row?.video_id);
  const storyId = storyIdFromRaw(row?.raw);
  const tokens = Array.from(
    new Set([accessToken(), pageAccessToken()].filter((t): t is string => Boolean(t)))
  );

  let sourceUrl: string | null = null;
  let permalink: string | null = firstNonEmpty(row?.permalink_url);
  let embedSrc: string | null = null;

  if (videoId) {
    for (const token of tokens) {
      const result = await graphGetWithToken(
        videoId,
        "source,permalink_url,embed_html,picture,format",
        token
      );
      if (!result.ok) {
        console.warn("[meta/ads] video playback lookup failed:", videoId, result.message);
        continue;
      }
      sourceUrl = firstNonEmpty(result.data?.source) || sourceUrl;
      permalink = firstNonEmpty(result.data?.permalink_url) || permalink;

      const formats = Array.isArray(result.data?.format) ? result.data.format : [];
      for (const f of formats) {
        const embed = String(f?.embed_html ?? result.data?.embed_html ?? "");
        const m = embed.match(/src=["']([^"']+)["']/i);
        if (m?.[1]) {
          if (/\.(mp4|mov)(\?|$)/i.test(m[1])) sourceUrl = sourceUrl || m[1];
          else if (/facebook\.com\/plugins\/video\.php/i.test(m[1])) embedSrc = embedSrc || m[1];
        }
      }
      const topEmbed = String(result.data?.embed_html ?? "");
      const topMatch = topEmbed.match(/src=["']([^"']+)["']/i);
      if (topMatch?.[1] && /facebook\.com\/plugins\/video\.php/i.test(topMatch[1])) {
        embedSrc = embedSrc || topMatch[1];
      }
      if (sourceUrl) break;
    }
  }

  if (!sourceUrl && storyId) {
    sourceUrl = await resolveStoryVideoSource(storyId);
  }

  if (!embedSrc && permalink) {
    embedSrc = facebookVideoEmbedSrc(permalink);
  }
  if (!embedSrc && videoId) {
    // 공개 페이지 영상이면 watch URL 임베드가 동작하는 경우가 있음
    embedSrc = facebookVideoEmbedSrc(`https://www.facebook.com/watch/?v=${videoId}`);
  }

  if (permalink && permalink !== row?.permalink_url) {
    // 캐시에 permalink 보강 (다음 오픈 속도)
    try {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("meta_ad_creatives")
        .update({ permalink_url: permalink, updated_at: new Date().toISOString() })
        .eq("ad_id", id);
    } catch {
      // ignore
    }
  }

  return { sourceUrl, embedSrc, permalink };
}

/** Meta 영상 source URL (만료 가능) — 프록시용 */
export async function resolveMetaCreativeVideoSourceUrl(adId: string): Promise<string | null> {
  const playback = await resolveMetaCreativeVideoPlayback(adId);
  return playback.sourceUrl;
}

export async function attachMetaCreatives<T extends {
  meta_ad_id?: string | null;
  utm_content?: string | null;
}>(
  items: T[],
  opts?: { cacheOnly?: boolean }
): Promise<Array<T & MetaCreativeAttach>> {
  const idByIndex = items.map((item) =>
    pickMetaAdId({ meta_ad_id: item.meta_ad_id, utm_content: item.utm_content })
  );
  const unique = Array.from(new Set(idByIndex.filter(Boolean) as string[]));
  const map = new Map<string, MetaCreativeCache>();

  // 캐시 일괄 로드 (목록 응답을 막지 않도록 raw JSON 제외)
  if (unique.length) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("meta_ad_creatives")
      .select(
        "ad_id, ad_name, creative_id, creative_type, thumbnail_url, image_url, video_id, permalink_url, fetch_status, fetch_error, fetched_at"
      )
      .in("ad_id", unique);
    for (const row of data ?? []) {
      const c = row as MetaCreativeCache;
      // 만료 CDN이어도 프록시가 재발급하므로 목록에는 표시. 백그라운드에서 갱신.
      if (hasPreview(c)) map.set(c.ad_id, c);
    }
  }

  const missing = unique.filter((id) => !map.has(id));
  if (missing.length && !opts?.cacheOnly) {
    const concurrency = 4;
    for (let i = 0; i < missing.length; i += concurrency) {
      const chunk = missing.slice(i, i + concurrency);
      const rows = await Promise.all(chunk.map((id) => resolveMetaAdCreative(id)));
      for (const row of rows) map.set(row.ad_id, row);
    }
  } else if (missing.length && opts?.cacheOnly) {
    // 목록은 캐시만 쓰고, 미스·만료분은 소수만 백그라운드 재조회
    void Promise.all(
      missing.slice(0, 12).map((id) =>
        fetchAndCacheMetaAdCreative(id).catch((e) => {
          console.warn("[meta/ads] background fill:", e instanceof Error ? e.message : e);
        })
      )
    );
  }

  // CDN URL이 남아 있어도 만료됐을 수 있음 → 오래된 캐시는 백그라운드 갱신
  if (opts?.cacheOnly) {
    const staleIds = unique.filter((id) => {
      const c = map.get(id);
      return Boolean(c && hasPreview(c) && !isFresh(c));
    });
    if (staleIds.length) {
      void Promise.all(
        staleIds.slice(0, 12).map((id) =>
          fetchAndCacheMetaAdCreative(id).catch((e) => {
            console.warn("[meta/ads] background refresh:", e instanceof Error ? e.message : e);
          })
        )
      );
    }
  }

  return items.map((item, idx) => {
    const adId = idByIndex[idx];
    if (!adId) {
      return {
        ...item,
        meta_ad_id: null,
        meta_ad_name: null,
        meta_creative_type: null,
        meta_creative_preview: null,
        meta_creative_full: null,
        meta_creative_status: null,
      };
    }
    const c = map.get(adId);
    const canShow = Boolean(c && hasPreview(c));
    return {
      ...item,
      meta_ad_id: adId,
      meta_ad_name: c?.ad_name ?? null,
      meta_creative_type: c?.creative_type ?? null,
      // 브라우저에는 Meta CDN을 직접 넣지 않음 — 프록시가 만료 URL을 재발급
      meta_creative_preview: canShow ? metaCreativeImageProxyPath(adId) : null,
      meta_creative_full: canShow ? metaCreativeImageProxyPath(adId, { full: true }) : null,
      meta_creative_status: c?.fetch_status ?? null,
    };
  });
}

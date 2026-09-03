import { getSupabaseAdmin } from "@/lib/supabase";
import { isLikelyMetaObjectId } from "@/lib/utm";

const GRAPH_VERSION = "v21.0";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/** 목록·확대 모두 image_url 우선 — Meta thumbnail_url은 서명 만료가 더 빨라 깨지는 경우가 많음 */
function previewUrl(row: MetaCreativeCache): string | null {
  return row.image_url || row.thumbnail_url || null;
}

/** 확대 보기용 — 원본 image_url 우선 */
function fullImageUrl(row: MetaCreativeCache): string | null {
  return row.image_url || row.thumbnail_url || null;
}

async function graphGet(
  path: string,
  fields: string,
  extraParams?: Record<string, string>
): Promise<{ ok: true; data: any } | { ok: false; status: number; message: string }> {
  const token = accessToken();
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
  if (creative.video_id) return "video";
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
  let imageUrl = media.image_url;
  let thumbUrl = media.thumbnail_url;
  let usedHash = false;
  let usedStory = false;

  if (!imageUrl && media.image_hash) {
    const fromHash = await resolveImageHashUrl(media.image_hash);
    if (fromHash) {
      imageUrl = fromHash;
      usedHash = true;
      if (!thumbUrl) thumbUrl = fromHash;
    }
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
  return Date.now() - t < CACHE_TTL_MS;
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
      // 이미지 없는 ok 캐시는 fresh로 치지 않음 → 백그라운드 재조회
      if (isFresh(c) && hasPreview(c)) map.set(c.ad_id, c);
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
    // 목록은 캐시만 쓰고, 미스·이미지없음 분은 소수만 백그라운드 재조회
    void Promise.all(
      missing.slice(0, 12).map((id) =>
        fetchAndCacheMetaAdCreative(id).catch((e) => {
          console.warn("[meta/ads] background fill:", e instanceof Error ? e.message : e);
        })
      )
    );
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
    return {
      ...item,
      meta_ad_id: adId,
      meta_ad_name: c?.ad_name ?? null,
      meta_creative_type: c?.creative_type ?? null,
      meta_creative_preview: c ? previewUrl(c) : null,
      meta_creative_full: c ? fullImageUrl(c) : null,
      meta_creative_status: c?.fetch_status ?? null,
    };
  });
}

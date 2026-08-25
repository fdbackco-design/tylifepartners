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

function accessToken(): string | null {
  const t = String(process.env.META_ACCESS_TOKEN ?? "").trim();
  return t || null;
}

export function isMetaAdsConfigured(): boolean {
  return Boolean(accessToken());
}

export function pickMetaAdId(opts: {
  meta_ad_id?: string | null;
  utm_content?: string | null;
}): string | null {
  if (isLikelyMetaObjectId(opts.meta_ad_id)) return String(opts.meta_ad_id).trim();
  if (isLikelyMetaObjectId(opts.utm_content)) return String(opts.utm_content).trim();
  return null;
}

function previewUrl(row: MetaCreativeCache): string | null {
  return row.thumbnail_url || row.image_url || null;
}

/** 확대 보기용 — 원본 image_url 우선 */
function fullImageUrl(row: MetaCreativeCache): string | null {
  return row.image_url || row.thumbnail_url || null;
}

async function graphGet(path: string, fields: string): Promise<{ ok: true; data: any } | { ok: false; status: number; message: string }> {
  const token = accessToken();
  if (!token) return { ok: false, status: 0, message: "META_ACCESS_TOKEN 미설정" };
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  url.searchParams.set("fields", fields);
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
  if (creative.image_url || creative.thumbnail_url) return "image";
  const ot = String(creative.object_type ?? "").toLowerCase();
  if (ot.includes("video")) return "video";
  if (ot.includes("image") || ot.includes("photo")) return "image";
  return ot || "unknown";
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

/** Marketing API로 광고 소재를 조회하고 DB에 캐시 */
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
      fetch_error: "META_ACCESS_TOKEN 미설정",
      fetched_at: now,
    };
    await upsertCreativeCache(row);
    return row;
  }

  const result = await graphGet(
    id,
    "id,name,creative{id,name,thumbnail_url,image_url,video_id,object_type,effective_object_story_id}"
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
    return row;
  }

  const creative = result.data?.creative ?? null;
  const row: MetaCreativeCache = {
    ad_id: id,
    ad_name: result.data?.name ? String(result.data.name) : null,
    creative_id: creative?.id ? String(creative.id) : null,
    creative_type: mapCreativeType(creative),
    thumbnail_url: creative?.thumbnail_url ? String(creative.thumbnail_url) : null,
    image_url: creative?.image_url ? String(creative.image_url) : null,
    video_id: creative?.video_id ? String(creative.video_id) : null,
    permalink_url: null,
    fetch_status: "ok",
    fetch_error: null,
    fetched_at: now,
  };
  await upsertCreativeCache(row, { raw: result.data });
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
  return Date.now() - t < CACHE_TTL_MS;
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
  items: T[]
): Promise<Array<T & MetaCreativeAttach>> {
  const idByIndex = items.map((item) =>
    pickMetaAdId({ meta_ad_id: item.meta_ad_id, utm_content: item.utm_content })
  );
  const unique = Array.from(new Set(idByIndex.filter(Boolean) as string[]));
  const map = new Map<string, MetaCreativeCache>();

  // 캐시 일괄 로드
  if (unique.length) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("meta_ad_creatives").select("*").in("ad_id", unique);
    for (const row of data ?? []) {
      const c = row as MetaCreativeCache;
      if (isFresh(c)) map.set(c.ad_id, c);
    }
  }

  // 미캐시만 제한 병렬 조회
  const missing = unique.filter((id) => !map.has(id));
  const concurrency = 4;
  for (let i = 0; i < missing.length; i += concurrency) {
    const chunk = missing.slice(i, i + concurrency);
    const rows = await Promise.all(chunk.map((id) => resolveMetaAdCreative(id)));
    for (const row of rows) map.set(row.ad_id, row);
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

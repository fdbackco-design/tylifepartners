import {
  LANDING_KEY_LABELS,
  type LandingKey,
} from "@/lib/landing-analytics/sections";
import { BUILTIN_LANDINGS } from "@/lib/managedLandings/builtinLandings";
import { isCodeLandingPreviewImageName } from "@/lib/managedLandings/codeZip/previewImages";
import { getManagedLandingByPath, getManagedLandingBySlug } from "@/lib/managedLandings/store";
import type { ManagedLandingRow } from "@/lib/managedLandings/types";
import { slugFromManagedLandingKey } from "@/lib/managedLandings/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const THUMBS: Record<string, string> = {
  "/": "/assets/hero_b2c_01.jpg",
  "/me": "/assets/hero_b2c_01.jpg",
  "/v1": "/assets/hero_b2c_01.jpg",
  "/v2": "/assets/hero_b2c_01_v2.jpg",
  "/v3": "/assets/hero_b2c_01_v3.jpg",
  "/business": "/assets/hero_b2b.jpg",
  "/sidejob": "/assets/hero_job.jpg",
  "/no-clawback": "/assets/hero_b2b.jpg",
  "/0623": "/assets/hero_0623_1.jpg",
  "/0623s": "/assets/hero_0623_2s.jpg",
  "/0715": "/assets/hero_0715_1.png",
  "/0715s": "/assets/hero_0715_2s.png",
  "/0907": "/assets/0907/sun-cruise.webp",
};

/** 랜딩 전체 미리보기용 히어로 이미지 (위에서 아래 순서) */
const LANDING_HEROES: Record<string, string[]> = {
  "/": ["/assets/hero_b2c_01.jpg", "/assets/hero_b2c_02.jpg"],
  "/me": ["/assets/hero_b2c_01.jpg", "/assets/hero_b2c_02.jpg"],
  "/v1": ["/assets/hero_b2c_01.jpg", "/assets/hero_b2c_02.jpg"],
  "/v2": ["/assets/hero_b2c_01_v2.jpg", "/assets/hero_b2c_02_v2.jpg"],
  "/v3": ["/assets/hero_b2c_01_v3.jpg", "/assets/hero_b2c_02_v3.jpg"],
  "/business": ["/assets/hero_b2b1.jpeg", "/assets/hero_b2b2.jpeg"],
  "/sidejob": ["/assets/hero_job.jpg", "/assets/hero_job2.jpg"],
  "/no-clawback": ["/assets/hero_b2b_v1_1.jpeg", "/assets/hero_b2b_v1_2.jpeg"],
  "/0623": ["/assets/hero_0623_1.jpg", "/assets/hero_0623_2.jpg"],
  "/0623s": ["/assets/hero_0623_1.jpg", "/assets/hero_0623_2s.jpg"],
  "/0715": ["/assets/hero_0715_1.png", "/assets/hero_0715_2.png"],
  "/0715s": ["/assets/hero_0715_1.png", "/assets/hero_0715_2s.png"],
  "/0907": [
    "/assets/0907/sun-cruise.webp",
    "/assets/0907/all-life-health.webp",
    "/assets/0907/all-life-report.webp",
    "/assets/0907/special-life-home.webp",
    "/assets/0907/feedlife-beaver.jpg",
  ],
};

const CODE_ASSET_BUCKET = "landing-assets";

export function normalizeEntryPage(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http")) {
    try {
      return new URL(s).pathname || "/";
    } catch {
      return s;
    }
  }
  return s.startsWith("/") ? s : `/${s}`;
}

export function landingPreviewSrc(entryPage: string | null | undefined, heroUrl?: string | null): string {
  if (heroUrl) return heroUrl;
  const p = normalizeEntryPage(entryPage);
  if (THUMBS[p]) return THUMBS[p];
  const noSlash = p.replace(/\/$/, "") || "/";
  return THUMBS[noSlash] || "/assets/hero_b2b.jpg";
}

function staticHeroImages(entryPage: string | null | undefined): string[] {
  const p = normalizeEntryPage(entryPage);
  const normalized = p.replace(/\/$/, "") || "/";
  const heroes = LANDING_HEROES[p] || LANDING_HEROES[normalized];
  if (heroes?.length) return heroes.filter(Boolean);
  const thumb = THUMBS[p] || THUMBS[normalized];
  return thumb ? [thumb] : [];
}

function pathFromLandingKey(landingKey: string): string | null {
  const label = LANDING_KEY_LABELS[landingKey as LandingKey];
  if (!label) return null;
  return label.split(" ")[0] || null;
}

function previewImagesFromCodeMeta(row: ManagedLandingRow): string[] {
  const fromMeta = row.code_meta?.preview_images;
  if (Array.isArray(fromMeta) && fromMeta.length) {
    return fromMeta.map((u) => String(u ?? "").trim()).filter(Boolean);
  }
  return [row.hero1_url, row.hero2_url].map((u) => String(u ?? "").trim()).filter(Boolean);
}

function storagePrefixFromAssetBase(assetBase: string): string | null {
  const marker = `/object/public/${CODE_ASSET_BUCKET}/`;
  const idx = assetBase.indexOf(marker);
  if (idx < 0) return null;
  let prefix = assetBase.slice(idx + marker.length);
  if (prefix.endsWith("/")) prefix = prefix.slice(0, -1);
  return prefix || null;
}

/** 이미 배포된 코드 랜딩 — 스토리지 에셋 목록으로 미리보기 복원 */
async function listCodeLandingPreviewFromStorage(row: ManagedLandingRow): Promise<string[]> {
  const base = String(row.code_asset_base ?? "").trim();
  if (!base) return [];
  const prefix = storagePrefixFromAssetBase(base);
  if (!prefix) return [];

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(CODE_ASSET_BUCKET).list(prefix, {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data?.length) return [];

    const baseUrl = base.endsWith("/") ? base : `${base}/`;
    const names = data
      .map((f) => f.name)
      .filter((n) => n && isCodeLandingPreviewImageName(n));
    return names.map((n) => `${baseUrl}${n}`);
  } catch {
    return [];
  }
}

async function scrapePreviewFromBundle(row: ManagedLandingRow): Promise<string[]> {
  const bundleUrl = String(row.code_bundle_url ?? "").trim();
  if (!bundleUrl) return [];
  try {
    const res = await fetch(bundleUrl, { cache: "force-cache" });
    if (!res.ok) return [];
    const text = await res.text();
    const re = /https?:\/\/[^"'`\s)]+\.(?:png|jpe?g|webp|gif|avif)/gi;
    const out: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const url = m[0];
      const name = url.split("/").pop() || "";
      if (!isCodeLandingPreviewImageName(name) || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
    return out;
  } catch {
    return [];
  }
}

async function resolveCodeLandingImages(row: ManagedLandingRow): Promise<string[]> {
  const fromMeta = previewImagesFromCodeMeta(row);
  if (fromMeta.length) return fromMeta;
  const fromStorage = await listCodeLandingPreviewFromStorage(row);
  if (fromStorage.length) return fromStorage;
  return scrapePreviewFromBundle(row);
}

/**
 * 히트맵 우측 미리보기용 — 랜딩 히어로 이미지 목록
 * managed 랜딩은 DB hero1/hero2, 고정 랜딩은 에셋 맵 사용
 */
export async function resolveLandingPageImages(opts: {
  entryPage?: string | null;
  landingKey?: string | null;
}): Promise<string[]> {
  const key = String(opts.landingKey ?? "").trim();
  if (key.startsWith("managed_")) {
    const slug = slugFromManagedLandingKey(key);
    if (slug) {
      const row = await getManagedLandingBySlug(slug);
      if (row?.kind === "code") {
        return resolveCodeLandingImages(row);
      }
      const imgs = [row?.hero1_url, row?.hero2_url].map((u) => String(u ?? "").trim()).filter(Boolean);
      if (imgs.length) return imgs;
    }
  }

  // landing_key 기준 고정 에셋 (entry_page 누락·오매핑 대비)
  const keyPath = key ? pathFromLandingKey(key) : null;
  if (keyPath) {
    const fromKey = staticHeroImages(keyPath);
    if (fromKey.length) return fromKey;
  }

  const path = normalizeEntryPage(opts.entryPage);
  const builtin =
    BUILTIN_LANDINGS.find((b) => b.landing_key === key) ||
    BUILTIN_LANDINGS.find((b) => b.path === path || b.path === keyPath);
  if (builtin) {
    const fromMap = staticHeroImages(builtin.path);
    if (fromMap.length) return fromMap;
    const imgs = [builtin.hero1_url, builtin.hero2_url]
      .map((u) => String(u ?? "").trim())
      .filter(Boolean);
    if (imgs.length) return imgs;
  }

  if (path && !LANDING_HEROES[path] && !THUMBS[path]) {
    const row = await getManagedLandingByPath(path);
    if (row?.kind === "code") {
      return resolveCodeLandingImages(row);
    }
    const imgs = [row?.hero1_url, row?.hero2_url].map((u) => String(u ?? "").trim()).filter(Boolean);
    if (imgs.length) return imgs;
  }

  return staticHeroImages(opts.entryPage || keyPath);
}

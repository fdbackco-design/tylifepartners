import { getManagedLandingByPath, getManagedLandingBySlug } from "@/lib/managedLandings/store";
import { slugFromManagedLandingKey } from "@/lib/managedLandings/types";

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
};

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
  const heroes = LANDING_HEROES[p] || LANDING_HEROES[p.replace(/\/$/, "") || "/"];
  if (heroes?.length) return heroes.filter(Boolean);
  const thumb = landingPreviewSrc(entryPage);
  return thumb ? [thumb] : [];
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
      const imgs = [row?.hero1_url, row?.hero2_url].map((u) => String(u ?? "").trim()).filter(Boolean);
      if (imgs.length) return imgs;
    }
  }

  const path = normalizeEntryPage(opts.entryPage);
  if (path && !LANDING_HEROES[path] && !THUMBS[path]) {
    const row = await getManagedLandingByPath(path);
    const imgs = [row?.hero1_url, row?.hero2_url].map((u) => String(u ?? "").trim()).filter(Boolean);
    if (imgs.length) return imgs;
  }

  return staticHeroImages(opts.entryPage);
}

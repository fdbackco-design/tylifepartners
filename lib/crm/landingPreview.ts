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

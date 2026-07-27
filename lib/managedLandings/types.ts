export type ManagedCtaPosition = "always" | "from_bottom" | "after_bottom";

export type ManagedLandingSection = {
  name: string;
  label: string;
  start: number;
  end: number;
};

export type ManagedLandingRow = {
  id: string;
  path: string;
  slug: string;
  title: string;
  custom_host: string | null;
  hero1_url: string;
  hero2_url: string;
  show_brochure: boolean;
  brochure_url: string | null;
  cta_position: ManagedCtaPosition;
  sections: ManagedLandingSection[];
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type ManagedLandingInput = {
  path: string;
  title?: string;
  custom_host?: string | null;
  hero1_url?: string;
  hero2_url?: string;
  show_brochure?: boolean;
  brochure_url?: string | null;
  cta_position?: ManagedCtaPosition;
  sections?: ManagedLandingSection[];
  published?: boolean;
};

export function landingKeyForManaged(slug: string): string {
  return `managed_${slug}`;
}

export function isManagedLandingKey(key: string): boolean {
  return key.startsWith("managed_");
}

export function slugFromManagedLandingKey(key: string): string | null {
  if (!isManagedLandingKey(key)) return null;
  return key.slice("managed_".length) || null;
}

export function normalizeLandingPath(raw: string): string {
  let p = String(raw ?? "").trim();
  if (!p) return "";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function slugFromPath(path: string): string {
  const p = normalizeLandingPath(path);
  const s = p.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "landing";
}

export function normalizeSections(raw: unknown): ManagedLandingSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ManagedLandingSection[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as Record<string, unknown>;
    if (!row || typeof row !== "object") continue;
    const start = Number(row.start);
    const end = Number(row.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const name = String(row.name ?? `section_${String(i + 1).padStart(2, "0")}`).trim();
    const label = String(row.label ?? `${i + 1}. 구간`).trim();
    out.push({
      name: name || `section_${String(i + 1).padStart(2, "0")}`,
      label: label || `${i + 1}. 구간`,
      start: Math.max(0, Math.min(1, start)),
      end: Math.max(0, Math.min(1, end)),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

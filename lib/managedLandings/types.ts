import type { ManagedFormConfig } from "@/lib/managedLandings/formConfig";

export type { ManagedFormConfig } from "@/lib/managedLandings/formConfig";

export type ManagedCtaPosition = "always" | "from_bottom" | "after_bottom";

export type ManagedLandingKind = "template" | "code";

export type ManagedLandingSection = {
  name: string;
  label: string;
  start: number;
  end: number;
};

export type ManagedLandingCodeMeta = {
  source_zip?: string;
  page_file?: string;
  css_file?: string;
  lead_form_file?: string | null;
  asset_count?: number;
  section_count?: number;
  bundled_at?: string;
  /** 히트맵/목록 미리보기용 — 페이지 등장 순 이미지 URL */
  preview_images?: string[];
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
  form_config: ManagedFormConfig;
  published: boolean;
  kind: ManagedLandingKind;
  code_bundle_url: string | null;
  code_css_url: string | null;
  code_asset_base: string | null;
  code_meta: ManagedLandingCodeMeta;
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
  form_config?: ManagedFormConfig;
  published?: boolean;
  kind?: ManagedLandingKind;
  code_bundle_url?: string | null;
  code_css_url?: string | null;
  code_asset_base?: string | null;
  code_meta?: ManagedLandingCodeMeta;
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

export function normalizeLandingKind(raw: unknown): ManagedLandingKind {
  return raw === "code" ? "code" : "template";
}

export function normalizeCodeMeta(raw: unknown): ManagedLandingCodeMeta {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const previewRaw = src.preview_images ?? src.previewImages;
  const preview_images = Array.isArray(previewRaw)
    ? previewRaw.map((u) => String(u ?? "").trim()).filter(Boolean)
    : undefined;
  return {
    ...(raw as ManagedLandingCodeMeta),
    ...(preview_images?.length ? { preview_images } : {}),
  };
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

/** data-analytics-section 마커 순서만으로 균등 폴백 구간 생성 */
export function sectionsFromMarkers(
  markers: Array<{ name: string; label: string }>
): ManagedLandingSection[] {
  if (!markers.length) return [];
  const n = markers.length;
  return markers.map((m, i) => ({
    name: m.name,
    label: m.label,
    start: i / n,
    end: (i + 1) / n,
  }));
}

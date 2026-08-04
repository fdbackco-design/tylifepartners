import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_FORM_CONFIG,
  normalizeFormConfig,
} from "@/lib/managedLandings/formConfig";
import {
  normalizeLandingPath,
  normalizeSections,
  slugFromPath,
  type ManagedCtaPosition,
  type ManagedLandingInput,
  type ManagedLandingRow,
  type ManagedLandingSection,
} from "@/lib/managedLandings/types";

const SELECT_COLS =
  "id, path, slug, title, custom_host, hero1_url, hero2_url, show_brochure, brochure_url, cta_position, sections, form_config, published, created_at, updated_at";

function mapRow(raw: Record<string, unknown>): ManagedLandingRow {
  return {
    id: String(raw.id),
    path: String(raw.path),
    slug: String(raw.slug),
    title: String(raw.title ?? "상담 안내"),
    custom_host: raw.custom_host != null ? String(raw.custom_host) : null,
    hero1_url: String(raw.hero1_url ?? ""),
    hero2_url: String(raw.hero2_url ?? ""),
    show_brochure: Boolean(raw.show_brochure),
    brochure_url: raw.brochure_url != null ? String(raw.brochure_url) : null,
    cta_position: (raw.cta_position as ManagedCtaPosition) || "from_bottom",
    sections: normalizeSections(raw.sections),
    form_config: normalizeFormConfig(raw.form_config ?? DEFAULT_FORM_CONFIG),
    published: Boolean(raw.published),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

const RESERVED_PATHS = new Set([
  "/",
  "/admin",
  "/api",
  "/business",
  "/complete",
  "/me",
  "/sidejob",
  "/no-clawback",
  "/v1",
  "/v2",
  "/v3",
  "/0623",
  "/0623s",
  "/0715",
  "/0715s",
  "/l",
]);

export function isReservedLandingPath(path: string): boolean {
  const p = normalizeLandingPath(path).toLowerCase();
  if (!p) return true;
  if (RESERVED_PATHS.has(p)) return true;
  if (p.startsWith("/admin") || p.startsWith("/api") || p.startsWith("/l/")) return true;
  return false;
}

export async function listManagedLandings(): Promise<ManagedLandingRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("managed_landings")
    .select(SELECT_COLS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getManagedLandingById(id: string): Promise<ManagedLandingRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("managed_landings")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getManagedLandingBySlug(
  slug: string,
  opts?: { publishedOnly?: boolean }
): Promise<ManagedLandingRow | null> {
  const supabase = getSupabaseAdmin();
  let q = supabase.from("managed_landings").select(SELECT_COLS).eq("slug", slug);
  if (opts?.publishedOnly) q = q.eq("published", true);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getManagedLandingByPath(
  path: string,
  opts?: { publishedOnly?: boolean }
): Promise<ManagedLandingRow | null> {
  const normalized = normalizeLandingPath(path);
  if (!normalized) return null;
  const supabase = getSupabaseAdmin();
  let q = supabase.from("managed_landings").select(SELECT_COLS).eq("path", normalized);
  if (opts?.publishedOnly) q = q.eq("published", true);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getManagedLandingSectionsByKey(
  landingKey: string
): Promise<ManagedLandingSection[] | null> {
  if (!landingKey.startsWith("managed_")) return null;
  const slug = landingKey.slice("managed_".length);
  if (!slug) return null;
  const row = await getManagedLandingBySlug(slug);
  return row?.sections?.length ? row.sections : null;
}

export async function createManagedLanding(
  input: ManagedLandingInput
): Promise<ManagedLandingRow> {
  const path = normalizeLandingPath(input.path);
  if (!path || path === "/") throw new Error("경로를 입력해주세요.");
  if (isReservedLandingPath(path)) throw new Error("예약된 경로입니다. 다른 경로를 사용해주세요.");

  const slug = slugFromPath(path);
  const cta = input.cta_position ?? "from_bottom";
  if (!["always", "from_bottom", "after_bottom"].includes(cta)) {
    throw new Error("cta_position이 올바르지 않습니다.");
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("managed_landings")
    .insert({
      path,
      slug,
      title: (input.title ?? "상담 안내").trim() || "상담 안내",
      custom_host: input.custom_host?.trim() || null,
      hero1_url: (input.hero1_url ?? "").trim(),
      hero2_url: (input.hero2_url ?? "").trim(),
      show_brochure: Boolean(input.show_brochure),
      brochure_url: input.show_brochure ? input.brochure_url?.trim() || null : null,
      cta_position: cta,
      sections: normalizeSections(input.sections ?? []),
      form_config: normalizeFormConfig(input.form_config ?? DEFAULT_FORM_CONFIG),
      published: Boolean(input.published),
      updated_at: now,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("이미 사용 중인 경로입니다.");
    }
    throw new Error(error.message);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function updateManagedLanding(
  id: string,
  input: Partial<ManagedLandingInput> & { slug?: string }
): Promise<ManagedLandingRow> {
  const existing = await getManagedLandingById(id);
  if (!existing) throw new Error("랜딩을 찾을 수 없습니다.");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.path != null) {
    const path = normalizeLandingPath(input.path);
    if (!path || path === "/") throw new Error("경로를 입력해주세요.");
    if (isReservedLandingPath(path) && path !== existing.path) {
      throw new Error("예약된 경로입니다. 다른 경로를 사용해주세요.");
    }
    patch.path = path;
    patch.slug = slugFromPath(path);
  }
  if (input.title != null) patch.title = input.title.trim() || "상담 안내";
  if (input.custom_host !== undefined) patch.custom_host = input.custom_host?.trim() || null;
  if (input.hero1_url != null) patch.hero1_url = input.hero1_url.trim();
  if (input.hero2_url != null) patch.hero2_url = input.hero2_url.trim();
  if (input.show_brochure != null) patch.show_brochure = Boolean(input.show_brochure);
  if (input.brochure_url !== undefined) patch.brochure_url = input.brochure_url?.trim() || null;
  if (input.cta_position != null) {
    if (!["always", "from_bottom", "after_bottom"].includes(input.cta_position)) {
      throw new Error("cta_position이 올바르지 않습니다.");
    }
    patch.cta_position = input.cta_position;
  }
  if (input.sections != null) patch.sections = normalizeSections(input.sections);
  if (input.form_config != null) patch.form_config = normalizeFormConfig(input.form_config);
  if (input.published != null) patch.published = Boolean(input.published);

  if (patch.show_brochure === false) patch.brochure_url = null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("managed_landings")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("이미 사용 중인 경로입니다.");
    }
    throw new Error(error.message);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function deleteManagedLanding(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("managed_landings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** 미들웨어용: 공개된 path → slug 목록 */
export async function listPublishedLandingPathMap(): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("managed_landings")
    .select("path, slug")
    .eq("published", true);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const path = String((row as { path: string }).path);
    const slug = String((row as { slug: string }).slug);
    map[path] = slug;
  }
  return map;
}

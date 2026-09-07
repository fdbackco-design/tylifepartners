import type { ManagedLandingRow } from "@/lib/managedLandings/types";
import { getSupabaseAdmin } from "@/lib/supabase";

/** 코드로 고정 배포된 랜딩 — /admin/landings 목록에 표시 */
export type BuiltinLanding = ManagedLandingRow & {
  builtin: true;
  landing_key: string;
  entry_pages: string[];
};

/** 고정 배포 랜딩 목록 (비어 있으면 관리 목록에 고정 항목 없음) */
export const BUILTIN_LANDINGS: BuiltinLanding[] = [];

export const BUILTIN_LANDING_PATHS = new Set(BUILTIN_LANDINGS.map((b) => b.path));

export function isBuiltinLandingId(id: string): boolean {
  return id.startsWith("builtin_");
}

export function getBuiltinLandingById(id: string): BuiltinLanding | null {
  return BUILTIN_LANDINGS.find((b) => b.id === id) ?? null;
}

/** path → published (행 없으면 true) */
export async function fetchBuiltinPublishMap(): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  for (const b of BUILTIN_LANDINGS) map[b.path] = true;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("builtin_landing_publish")
      .select("path, published");
    if (error) {
      console.error("fetchBuiltinPublishMap:", error.message);
      return map;
    }
    for (const row of data ?? []) {
      const path = String((row as { path: string }).path);
      map[path] = Boolean((row as { published: boolean }).published);
    }
  } catch (e) {
    console.error("fetchBuiltinPublishMap:", e);
  }
  return map;
}

export async function setBuiltinLandingPublished(
  path: string,
  published: boolean
): Promise<boolean> {
  if (!BUILTIN_LANDING_PATHS.has(path)) {
    throw new Error("고정 배포 랜딩이 아닙니다.");
  }
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from("builtin_landing_publish").upsert(
    { path, published, updated_at: now },
    { onConflict: "path" }
  );
  if (error) throw new Error(error.message);
  return published;
}

/** DB 공개 상태를 반영해 고정 랜딩을 병합 */
export async function mergeBuiltinLandings(
  items: ManagedLandingRow[]
): Promise<Array<ManagedLandingRow & { builtin?: boolean; landing_key?: string }>> {
  const publishMap = await fetchBuiltinPublishMap();
  const paths = new Set(items.map((i) => i.path));
  const extras = BUILTIN_LANDINGS.filter((b) => !paths.has(b.path)).map((b) => ({
    ...b,
    published: publishMap[b.path] !== false,
    updated_at: new Date().toISOString(),
  }));
  return [...extras, ...items];
}

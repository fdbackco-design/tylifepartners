import { getSupabaseAdmin } from "@/lib/supabase";

export type UtmSourceRow = {
  id: string;
  value: string;
  label: string;
  sheet_label: string;
  created_at: string;
};

/** URL·DB에 쓰이는 utm_source 값 → 구글 시트 C/G 표시명 */
export async function resolveSheetMediumFromUtmSource(
  utmSource: string | null | undefined,
  fallbackSource?: string | null
): Promise<string> {
  const raw = (utmSource || fallbackSource || "").trim();
  if (!raw) return "";

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("utm_sources")
      .select("sheet_label")
      .eq("value", raw)
      .maybeSingle();

    if (error) {
      console.error("resolveSheetMediumFromUtmSource error:", error.message);
      return raw;
    }

    const mapped = data?.sheet_label?.trim();
    return mapped || raw;
  } catch (e) {
    console.error("resolveSheetMediumFromUtmSource error:", e);
    return raw;
  }
}

export function buildUtmLink(baseUrl: string, path: string, utmSource: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl.replace(/\/$/, ""));
  url.searchParams.set("utm_source", utmSource.trim());
  return url.toString();
}

export function normalizeUtmSourceValue(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value || value.length > 64) return null;
  if (!/^[a-z0-9_\-]+$/.test(value)) return null;
  return value;
}

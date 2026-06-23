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

export type ParsedUtmSourceInput = {
  value: string;
  label: string;
  sheetLabel: string;
};

export function parseUtmSourceInput(body: {
  value?: unknown;
  label?: unknown;
  sheet_label?: unknown;
}): { ok: true; data: ParsedUtmSourceInput } | { ok: false; message: string } {
  const value = normalizeUtmSourceValue(String(body.value ?? ""));
  const label = String(body.label ?? "").trim();
  const sheetLabel = String(body.sheet_label ?? label).trim();

  if (!value) {
    return {
      ok: false,
      message: "utm_source 값은 영문·숫자·_·- 만 64자 이내로 입력해 주세요.",
    };
  }
  if (!label || label.length > 80) {
    return { ok: false, message: "표시 이름을 입력해 주세요. (80자 이내)" };
  }
  if (!sheetLabel || sheetLabel.length > 80) {
    return { ok: false, message: "시트 표시명을 입력해 주세요. (80자 이내)" };
  }

  return { ok: true, data: { value, label, sheetLabel } };
}

export function isUtmSourcesTableMissing(message: string): boolean {
  return (
    /table.*utm_sources|utm_sources.*(not found|does not exist)/i.test(message) ||
    /schema cache/i.test(message) ||
    /PGRST205/i.test(message)
  );
}

export function utmSourcesDbErrorMessage(
  error: { message?: string },
  action: "조회" | "저장" | "수정" | "삭제"
): string {
  const msg = error.message ?? "";
  if (isUtmSourcesTableMissing(msg)) {
    return "utm_sources 테이블이 없습니다. Supabase SQL Editor에서 supabase/migrations/014_utm_sources.sql 을 실행해 주세요.";
  }
  return `${action}에 실패했습니다.`;
}

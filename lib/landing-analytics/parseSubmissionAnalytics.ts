const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedSubmissionAnalytics = {
  analytics_session_id: string | null;
  max_scroll_depth: number | null;
  last_section_name: string | null;
  last_section_label: string | null;
};

export function parseSubmissionAnalytics(body: Record<string, unknown>): ParsedSubmissionAnalytics {
  const rawId = body.analytics_session_id;
  const analytics_session_id =
    typeof rawId === "string" && UUID_RE.test(rawId) ? rawId : null;

  const rawDepth = body.max_scroll_depth;
  let max_scroll_depth: number | null = null;
  if (rawDepth != null && rawDepth !== "") {
    const n = typeof rawDepth === "number" ? rawDepth : Number(rawDepth);
    if (Number.isFinite(n)) max_scroll_depth = Math.min(100, Math.max(0, n));
  }

  const last_section_name = clampStr(body.last_section_name, 80);
  const last_section_label = clampStr(body.last_section_label, 120);

  return {
    analytics_session_id,
    max_scroll_depth,
    last_section_name,
    last_section_label,
  };
}

function clampStr(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s.slice(0, max) : null;
}

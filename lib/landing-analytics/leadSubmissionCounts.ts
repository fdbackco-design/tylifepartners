import type { LandingKey } from "@/lib/landing-analytics/sections";
import { getSupabaseAdmin } from "@/lib/supabase";

type LeadTable = "leads" | "tylife_b2b";

const LANDING_LEAD_CONFIG: Record<
  LandingKey,
  { table: LeadTable; entryPages: string[] }
> = {
  parent_main: { table: "leads", entryPages: ["/"] },
  parent_v1: { table: "leads", entryPages: ["/v1"] },
  parent_v2: { table: "leads", entryPages: ["/v2"] },
  parent_v3: { table: "leads", entryPages: ["/v3"] },
  me: { table: "leads", entryPages: ["/me"] },
  business: { table: "tylife_b2b", entryPages: ["business", "/business"] },
  no_clawback: { table: "tylife_b2b", entryPages: ["no-clawback", "/no-clawback"] },
  sidejob: { table: "tylife_b2b", entryPages: ["sidejob", "/sidejob"] },
  landing_0623: { table: "leads", entryPages: ["0623", "/0623"] },
  landing_0623s: { table: "leads", entryPages: ["0623s", "/0623s"] },
};

/** 기간·랜딩별 상담 신청 시 last_section_name 건수 */
export async function fetchSubmissionCountBySection(
  landingKey: LandingKey,
  from: Date,
  to: Date
): Promise<Map<string, number>> {
  const config = LANDING_LEAD_CONFIG[landingKey];
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(config.table)
    .select("last_section_name")
    .in("entry_page", config.entryPages)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .not("last_section_name", "is", null);

  const counts = new Map<string, number>();
  if (error) {
    console.error("fetchSubmissionCountBySection error:", error);
    return counts;
  }

  for (const row of data ?? []) {
    const name = row.last_section_name as string;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return counts;
}

export function attachSubmissionCountsToDropout<
  T extends { name: string; submission_count?: number },
>(rows: T[], counts: Map<string, number>): (T & { submission_count: number })[] {
  return rows.map((row) => ({
    ...row,
    submission_count: counts.get(row.name) ?? 0,
  }));
}

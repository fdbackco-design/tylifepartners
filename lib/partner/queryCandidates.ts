import { startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { applyHiddenLeadFilter, loadHiddenLeadIdMaps } from "@/lib/crm/leadListHide";
import { normalizeStatus } from "@/lib/crm/status";
import type { PartnerApiPermissions, PartnerPublicCandidate } from "@/lib/partner/types";
import { loadActiveBlacklistPhones } from "@/lib/phoneBlacklist";
import { getSupabaseAdmin } from "@/lib/supabase";

const SELECT =
  "id, status, created_at, region, job, job_rank, age_group, entry_page, utm_source, merge_status, normalized_phone";

function mapRow(row: Record<string, unknown>): PartnerPublicCandidate {
  const createdIso = String(row.created_at ?? "");
  return {
    id: String(row.id),
    status: normalizeStatus(row.status as string),
    created_at: createdIso,
    region: String(row.region ?? ""),
    job: String(row.job ?? ""),
    job_rank: String(row.job_rank ?? ""),
    age_group: String(row.age_group ?? ""),
    entry_page: String(row.entry_page ?? ""),
    utm_source: String(row.utm_source ?? ""),
  };
}

function csv(sp: URLSearchParams, key: string): string[] {
  return String(sp.get(key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function queryPartnerCandidates(
  permissions: PartnerApiPermissions,
  sp: URLSearchParams,
  limit: number,
  offset: number
): Promise<{ items: PartnerPublicCandidate[]; total: number }> {
  const supabase = getSupabaseAdmin();
  const [blockedPhones, hiddenLeads] = await Promise.all([
    loadActiveBlacklistPhones(),
    loadHiddenLeadIdMaps(),
  ]);

  let query = supabase
    .from("tylife_b2b")
    .select(SELECT, { count: "exact" })
    .or("merge_status.eq.active,merge_status.is.null")
    .order("created_at", { ascending: false });

  if (permissions.candidate_utm_sources.length) {
    query = query.in("utm_source", permissions.candidate_utm_sources);
  }
  if (permissions.candidate_entry_pages.length) {
    query = query.in("entry_page", permissions.candidate_entry_pages);
  }
  if (permissions.candidate_regions.length) {
    const parts = permissions.candidate_regions.map((r) => {
      const safe = r.replace(/[,.()]/g, "");
      return `region.ilike.%${safe}%`;
    });
    query = query.or(parts.join(","));
  }

  const statusFilter = csv(sp, "status");
  if (statusFilter.length) query = query.in("status", statusFilter);

  const regionReq = csv(sp, "region");
  if (regionReq.length) {
    const allowed = regionReq.filter((r) =>
      permissions.candidate_regions.length
        ? permissions.candidate_regions.some((a) => r.includes(a) || a.includes(r))
        : true
    );
    if (!allowed.length) return { items: [], total: 0 };
    const parts = allowed.map((r) => {
      const safe = r.replace(/[,.()]/g, "");
      return `region.ilike.%${safe}%`;
    });
    query = query.or(parts.join(","));
  }

  const dateFrom = sp.get("date_from")?.trim();
  const dateTo = sp.get("date_to")?.trim();
  if (dateFrom) query = query.gte("created_at", startOfKstDayIso(dateFrom));
  if (dateTo) query = query.lt("created_at", startOfNextKstDayIso(dateTo));

  if (blockedPhones.length) {
    const safe = blockedPhones.filter((p) => /^\d{10,11}$/.test(p));
    if (safe.length) query = query.not("normalized_phone", "in", `(${safe.join(",")})`);
  }
  query = applyHiddenLeadFilter(query, "tylife_b2b", hiddenLeads) as typeof query;

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  return {
    items: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}

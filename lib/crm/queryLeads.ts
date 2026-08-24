import { startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { attachAssigneeHistories } from "@/lib/crm/assigneeHistory";
import { CANDIDATE_SELECT, CONSUMER_SELECT, loadStaffMaps, mapLeadRow } from "@/lib/crm/mapLead";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { getAdminStatus } from "@/lib/crm/status";
import type { LeadCategory, LeadRow, SessionUser } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export type LeadQueryInput = {
  category: LeadCategory | "all";
  search?: string;
  assigneeIds?: string[];
  teamIds?: string[];
  regions?: string[];
  statuses?: string[];
  jobRanks?: string[];
  ageGroups?: string[];
  jobs?: string[];
  entryPages?: string[];
  utmSources?: string[];
  dateFrom?: string;
  dateTo?: string;
  needReassign?: boolean;
  unassigned?: boolean;
  limit?: number;
  offset?: number;
};

function csv(v: string | null | undefined): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseLeadQuery(sp: URLSearchParams): LeadQueryInput {
  const cat = sp.get("category");
  const category: LeadQueryInput["category"] =
    cat === "candidates" || cat === "b2b" ? "candidates" : cat === "all" ? "all" : "consumers";
  return {
    category,
    search: sp.get("search")?.trim() || undefined,
    assigneeIds: csv(sp.get("assignee_ids")),
    teamIds: csv(sp.get("team_ids")),
    regions: csv(sp.get("regions")),
    statuses: csv(sp.get("statuses")),
    jobRanks: csv(sp.get("job_ranks")),
    ageGroups: csv(sp.get("age_groups")),
    jobs: csv(sp.get("jobs")),
    entryPages: csv(sp.get("entry_pages")),
    utmSources: csv(sp.get("utm_sources")),
    dateFrom: sp.get("date_from") || undefined,
    dateTo: sp.get("date_to") || undefined,
    needReassign: sp.get("need_reassign") === "1" || sp.get("recontact") === "1",
    unassigned: sp.get("unassigned") === "1",
    limit: Math.min(Math.max(Number(sp.get("limit") || 50), 1), 5000),
    offset: Math.max(Number(sp.get("offset") || 0), 0),
  };
}

const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

function applyCommonFilters(
  query: any,
  q: LeadQueryInput,
  scopedIds: string[] | "all",
  rank: SessionUser["rank"]
) {
  if (q.search) {
    const term = `%${q.search.replace(/,/g, "")}%`;
    query = query.or(`name.ilike.${term},phone.ilike.${term}`);
  }
  let assigneeFilter = [...(q.assigneeIds ?? [])];
  if (scopedIds !== "all") {
    if (!scopedIds.length) {
      return query.eq("id", NO_MATCH_ID);
    }
    assigneeFilter = assigneeFilter.length
      ? assigneeFilter.filter((id) => scopedIds.includes(id))
      : [...scopedIds];
    // 스코프 밖만 고르면 빈 배열이 되어 필터가 빠지던 문제 → 결과 없음으로 닫음
    if (!assigneeFilter.length) {
      return query.eq("id", NO_MATCH_ID);
    }
  }
  if (q.unassigned) {
    // 미배정은 전체 관리자만
    if (rank !== "admin") {
      return query.eq("id", NO_MATCH_ID);
    }
    query = query.is("assignee_id", null);
  } else if (assigneeFilter.length) {
    query = query.in("assignee_id", assigneeFilter);
  } else if (scopedIds !== "all") {
    return query.eq("id", NO_MATCH_ID);
  }
  if (q.statuses?.length) query = query.in("status", q.statuses);
  if (q.jobRanks?.length) query = query.in("job_rank", q.jobRanks);
  if (q.ageGroups?.length) query = query.in("age_group", q.ageGroups);
  if (q.jobs?.length) query = query.in("job", q.jobs);
  if (q.entryPages?.length) query = query.in("entry_page", q.entryPages);
  if (q.utmSources?.length) query = query.in("utm_source", q.utmSources);
  if (q.dateFrom) query = query.gte("created_at", startOfKstDayIso(q.dateFrom));
  if (q.dateTo) query = query.lt("created_at", startOfNextKstDayIso(q.dateTo));
  return query;
}

function applyRegionFilter(query: any, regions: string[] | undefined, includeLocation: boolean) {
  if (!regions?.length) return query;
  const parts = regions.flatMap((r) => {
    const safe = r.replace(/[,.()]/g, "");
    return includeLocation ? [`region.ilike.%${safe}%`, `location.ilike.%${safe}%`] : [`region.ilike.%${safe}%`];
  });
  return query.or(parts.join(","));
}

export async function queryLeads(session: SessionUser, q: LeadQueryInput): Promise<{ items: LeadRow[]; total: number }> {
  const supabase = getSupabaseAdmin();
  const scoped = await visibleAssigneeIds(session);
  const { staffById, parentNameById } = await loadStaffMaps();

  let teamAssigneeIds: string[] | null = null;
  if (q.teamIds?.length) {
    const ids: string[] = [];
    for (const [id, s] of Array.from(staffById.entries())) {
      if (q.teamIds.includes(id) || (s.parent_id && q.teamIds.includes(s.parent_id))) ids.push(id);
    }
    teamAssigneeIds = ids;
  }

  const fetchTable = async (kind: "consumers" | "candidates") => {
    const table = kind === "candidates" ? "tylife_b2b" : "leads";
    const select = kind === "candidates" ? CANDIDATE_SELECT : CONSUMER_SELECT;
    let query = (supabase.from(table) as any)
      .select(select, { count: "exact" })
      .order("created_at", { ascending: false });
    query = applyCommonFilters(query, q, scoped, session.rank);
    if (teamAssigneeIds) {
      let ids = teamAssigneeIds;
      if (scoped !== "all") ids = ids.filter((id) => scoped.includes(id));
      query = query.in("assignee_id", ids.length ? ids : [NO_MATCH_ID]);
    }
    query = applyRegionFilter(query, q.regions, kind === "consumers");
    if (q.needReassign) {
      query = query.in("status", ["대기", "1차컨택", "부재(메신저완료)"]);
    }
    if (q.category !== "all") {
      query = query.range(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 50) - 1);
    } else {
      query = query.limit(3000);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    const items = (data ?? []).map((row: Record<string, unknown>) =>
      mapLeadRow(row, kind, staffById, parentNameById)
    );
    return { items, total: count ?? items.length };
  };

  const isNeedReassign = (i: LeadRow) =>
    i.admin_status?.key === "need_reassign" ||
    getAdminStatus(i.status, i.status_changed_at, i.created_at_iso, i.assignee_id)?.key === "need_reassign";

  if (q.category === "all") {
    const [a, b] = await Promise.all([fetchTable("consumers"), fetchTable("candidates")]);
    let items = [...a.items, ...b.items].sort((x, y) => (x.created_at_iso < y.created_at_iso ? 1 : -1));
    if (q.needReassign) items = items.filter(isNeedReassign);
    const total = items.length;
    const page = items.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 50));
    return { items: await attachAssigneeHistories(page), total };
  }

  const result = await fetchTable(q.category);
  if (q.needReassign) {
    const items = result.items.filter(isNeedReassign);
    return { items: await attachAssigneeHistories(items), total: items.length };
  }
  return { items: await attachAssigneeHistories(result.items), total: result.total };
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { kstYmd, startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { loadHiddenLeadIdMaps, type HiddenLeadMaps } from "@/lib/crm/leadListHide";
import { getTtlCache, setTtlCache } from "@/lib/crm/ttlCache";
import { getSupabaseAdmin } from "@/lib/supabase";

const CONTACT_STATUSES = ["1차컨택", "부재(메신저완료)", "상담완료", "통화약속", "대면확정", "가입완료"] as const;
const DASHBOARD_CACHE_TTL_MS = 30_000;
const PAGE_SIZE = 1000;

function notInIdsFilter(ids: Set<string>): string | null {
  if (!ids.size) return null;
  return `(${Array.from(ids).join(",")})`;
}

function isHiddenLead(hidden: HiddenLeadMaps, leadTable: string | null | undefined, leadId: string): boolean {
  if (!leadId) return false;
  if (leadTable === "tylife_b2b") return hidden.tylife_b2b.has(leadId);
  return hidden.leads.has(leadId);
}

async function countExact(
  table: "leads" | "tylife_b2b",
  build: (q: any) => any
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await build(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) {
    console.warn(`[dashboard] count ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/** 기간 내 배정 건: 인원별 건수 + 리드 id 집합(1차컨택 로그 필터용) */
async function loadAssignedInPeriod(opts: {
  table: "leads" | "tylife_b2b";
  rangeStart: string;
  rangeEnd: string;
  hiddenFilter: string | null;
}): Promise<{
  counts: Map<string, number>;
  /** lead_id → 배정 담당자 id */
  assigneeByLeadId: Map<string, string>;
}> {
  const supabase = getSupabaseAdmin();
  const counts = new Map<string, number>();
  const assigneeByLeadId = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase
      .from(opts.table)
      .select("id, assignee_id")
      .gte("assigned_at", opts.rangeStart)
      .lt("assigned_at", opts.rangeEnd)
      .not("assignee_id", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (opts.hiddenFilter) q = q.not("id", "in", opts.hiddenFilter);
    const { data, error } = await q;
    if (error) {
      console.warn(`[dashboard] assigned ${opts.table}:`, error.message);
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const leadId = String(row.id ?? "");
      const assigneeId = String(row.assignee_id ?? "");
      if (!leadId || !assigneeId) continue;
      counts.set(assigneeId, (counts.get(assigneeId) ?? 0) + 1);
      assigneeByLeadId.set(leadId, assigneeId);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return { counts, assigneeByLeadId };
}

/**
 * 기간 중 assigned_at이 있는 리드에 대해
 * lead_status_logs.to_status = '1차컨택' 로그 건수를 담당자별로 집계
 */
async function loadFirstContactCountsForAssigned(opts: {
  assigneeByLeadId: Map<string, string>;
  leadTable: "leads" | "tylife_b2b";
  hidden: HiddenLeadMaps;
}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const leadIds = Array.from(opts.assigneeByLeadId.keys());
  if (!leadIds.length) return counts;

  const supabase = getSupabaseAdmin();
  const IN_CHUNK = 100;
  for (let i = 0; i < leadIds.length; i += IN_CHUNK) {
    const chunk = leadIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("lead_status_logs")
      .select("lead_id, lead_table, assignee_id")
      .eq("to_status", "1차컨택")
      .in("lead_id", chunk);
    if (error) {
      console.warn("[dashboard] status logs:", error.message);
      break;
    }
    for (const row of data ?? []) {
      const leadId = String(row.lead_id ?? "");
      if (!leadId || !opts.assigneeByLeadId.has(leadId)) continue;
      if (isHiddenLead(opts.hidden, row.lead_table, leadId)) continue;
      // 동일 lead_id가 양 테이블에 있을 수 있어 테이블이 맞을 때만 집계
      const logTable = row.lead_table ? String(row.lead_table) : "leads";
      if (logTable !== opts.leadTable) continue;
      const assigneeId = opts.assigneeByLeadId.get(leadId);
      if (!assigneeId) continue;
      counts.set(assigneeId, (counts.get(assigneeId) ?? 0) + 1);
    }
  }
  return counts;
}

function mergeCounts(into: Map<string, number>, from: Map<string, number>) {
  for (const [id, n] of Array.from(from.entries())) into.set(id, (into.get(id) ?? 0) + n);
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const from = sp.get("date_from") || kstYmd();
  const to = sp.get("date_to") || from;
  const cacheKey = `dashboard:v2:${from}:${to}`;
  const cached = getTtlCache<Record<string, unknown>>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const rangeStart = startOfKstDayIso(from);
  const rangeEnd = startOfNextKstDayIso(to);
  const supabase = getSupabaseAdmin();

  const hiddenLeads = await loadHiddenLeadIdMaps();
  const hiddenLeadsFilter = notInIdsFilter(hiddenLeads.leads);
  const hiddenCandidatesFilter = notInIdsFilter(hiddenLeads.tylife_b2b);

  const applyHidden = (table: "leads" | "tylife_b2b", q: any) => {
    const hiddenFilter = table === "tylife_b2b" ? hiddenCandidatesFilter : hiddenLeadsFilter;
    return hiddenFilter ? q.not("id", "in", hiddenFilter) : q;
  };

  const [
    staffRes,
    contactedLeads,
    contactedB2b,
    inboundLeads,
    inboundB2b,
    assignedLeads,
    assignedB2b,
  ] = await Promise.all([
    supabase.from("staff_users").select("id, name, rank").eq("is_active", true),
    countExact("leads", (q) =>
      applyHidden(
        "leads",
        q
          .gte("created_at", rangeStart)
          .lt("created_at", rangeEnd)
          .in("status", [...CONTACT_STATUSES])
          .or("merge_status.eq.active,merge_status.is.null")
      )
    ),
    countExact("tylife_b2b", (q) =>
      applyHidden(
        "tylife_b2b",
        q
          .gte("created_at", rangeStart)
          .lt("created_at", rangeEnd)
          .in("status", [...CONTACT_STATUSES])
          .or("merge_status.eq.active,merge_status.is.null")
      )
    ),
    countExact("leads", (q) =>
      applyHidden("leads", q.gte("created_at", rangeStart).lt("created_at", rangeEnd))
    ),
    countExact("tylife_b2b", (q) =>
      applyHidden("tylife_b2b", q.gte("created_at", rangeStart).lt("created_at", rangeEnd))
    ),
    loadAssignedInPeriod({
      table: "leads",
      rangeStart,
      rangeEnd,
      hiddenFilter: hiddenLeadsFilter,
    }),
    loadAssignedInPeriod({
      table: "tylife_b2b",
      rangeStart,
      rangeEnd,
      hiddenFilter: hiddenCandidatesFilter,
    }),
  ]);

  const [contactLeads, contactB2b] = await Promise.all([
    loadFirstContactCountsForAssigned({
      assigneeByLeadId: assignedLeads.assigneeByLeadId,
      leadTable: "leads",
      hidden: hiddenLeads,
    }),
    loadFirstContactCountsForAssigned({
      assigneeByLeadId: assignedB2b.assigneeByLeadId,
      leadTable: "tylife_b2b",
      hidden: hiddenLeads,
    }),
  ]);

  const people = staffRes.data ?? [];
  const contacted = contactedLeads + contactedB2b;
  const inbound = inboundLeads + inboundB2b;

  const assignedCounts = new Map<string, number>();
  mergeCounts(assignedCounts, assignedLeads.counts);
  mergeCounts(assignedCounts, assignedB2b.counts);

  const contactByPerson = new Map<string, number>();
  mergeCounts(contactByPerson, contactLeads);
  mergeCounts(contactByPerson, contactB2b);

  const by_person = people.map((p) => {
    const assigned = assignedCounts.get(p.id) ?? 0;
    const first_contact = contactByPerson.get(p.id) ?? 0;
    return {
      staff_id: p.id,
      staff_name: p.name,
      rank: p.rank,
      assigned,
      first_contact,
      first_contact_rate: assigned > 0 ? Math.round((first_contact / assigned) * 1000) / 10 : null,
    };
  });

  const payload = {
    ok: true as const,
    date_from: from,
    date_to: to,
    summary: {
      inbound,
      contacted,
      rate: inbound > 0 ? Math.round((contacted / inbound) * 1000) / 10 : null,
    },
    by_person,
  };

  setTtlCache(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);
  return NextResponse.json(payload);
}

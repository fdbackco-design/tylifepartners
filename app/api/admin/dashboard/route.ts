import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { kstYmd, startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { loadHiddenLeadIdMaps, type HiddenLeadMaps } from "@/lib/crm/leadListHide";
import { getTtlCache, setTtlCache } from "@/lib/crm/ttlCache";
import { getSupabaseAdmin } from "@/lib/supabase";

const CONTACT_STATUSES = ["1차컨택", "부재(메신저완료)", "상담완료", "대면확정", "가입완료"] as const;
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

/** assignee_id만 페이지 단위로 모아 인원별 배정 건수 */
async function loadAssignedCounts(opts: {
  table: "leads" | "tylife_b2b";
  rangeStart: string;
  rangeEnd: string;
  hiddenFilter: string | null;
}): Promise<Map<string, number>> {
  const supabase = getSupabaseAdmin();
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase
      .from(opts.table)
      .select("assignee_id")
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
      const id = String(row.assignee_id ?? "");
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return counts;
}

type StatusLogRow = {
  assignee_id: string | null;
  lead_id: string | null;
  lead_table: string | null;
};

async function loadFirstContactLogs(opts: {
  rangeStart: string;
  rangeEnd: string;
  hidden: HiddenLeadMaps;
}): Promise<StatusLogRow[]> {
  const supabase = getSupabaseAdmin();
  const out: StatusLogRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("lead_status_logs")
      .select("assignee_id, lead_id, lead_table")
      .eq("to_status", "1차컨택")
      .gte("changed_at", opts.rangeStart)
      .lt("changed_at", opts.rangeEnd)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn("[dashboard] status logs:", error.message);
      break;
    }
    const rows = data ?? [];
    for (const row of rows) {
      const leadId = String(row.lead_id ?? "");
      if (isHiddenLead(opts.hidden, row.lead_table, leadId)) continue;
      out.push({
        assignee_id: row.assignee_id ? String(row.assignee_id) : null,
        lead_id: leadId || null,
        lead_table: row.lead_table ? String(row.lead_table) : null,
      });
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
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
  const cacheKey = `dashboard:${from}:${to}`;
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
    logs,
    contactedLeads,
    contactedB2b,
    inboundLeads,
    inboundB2b,
    assignedLeads,
    assignedB2b,
  ] = await Promise.all([
    supabase.from("staff_users").select("id, name, rank").eq("is_active", true),
    loadFirstContactLogs({ rangeStart, rangeEnd, hidden: hiddenLeads }),
    countExact("leads", (q) =>
      applyHidden(
        "leads",
        q
          .gte("assigned_at", rangeStart)
          .lt("assigned_at", rangeEnd)
          .in("status", [...CONTACT_STATUSES])
          .or("merge_status.eq.active,merge_status.is.null")
      )
    ),
    countExact("tylife_b2b", (q) =>
      applyHidden(
        "tylife_b2b",
        q
          .gte("assigned_at", rangeStart)
          .lt("assigned_at", rangeEnd)
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
    loadAssignedCounts({
      table: "leads",
      rangeStart,
      rangeEnd,
      hiddenFilter: hiddenLeadsFilter,
    }),
    loadAssignedCounts({
      table: "tylife_b2b",
      rangeStart,
      rangeEnd,
      hiddenFilter: hiddenCandidatesFilter,
    }),
  ]);

  const people = staffRes.data ?? [];
  const contacted = contactedLeads + contactedB2b;
  const inbound = inboundLeads + inboundB2b;

  const assignedCounts = new Map<string, number>();
  mergeCounts(assignedCounts, assignedLeads);
  mergeCounts(assignedCounts, assignedB2b);

  const contactByPerson = new Map<string, number>();
  for (const log of logs) {
    const id = log.assignee_id;
    if (!id) continue;
    contactByPerson.set(id, (contactByPerson.get(id) ?? 0) + 1);
  }

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

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { addDaysYmd, kstYmd, startOfKstDayIso, startOfNextKstDayIso } from "@/lib/crm/kst";
import { loadHiddenLeadIdMaps } from "@/lib/crm/leadListHide";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

function notInIdsFilter(ids: Set<string>): string | null {
  if (!ids.size) return null;
  return `(${Array.from(ids).join(",")})`;
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
  const supabase = getSupabaseAdmin();
  const [scoped, hiddenLeads] = await Promise.all([visibleAssigneeIds(session), loadHiddenLeadIdMaps()]);
  const rangeStart = startOfKstDayIso(from);
  const rangeEnd = startOfNextKstDayIso(to);
  const hiddenLeadsFilter = notInIdsFilter(hiddenLeads.leads);
  const hiddenCandidatesFilter = notInIdsFilter(hiddenLeads.tylife_b2b);

  const { data: staff } = await supabase.from("staff_users").select("id, name, rank, parent_id").eq("is_active", true);
  let people = staff ?? [];
  if (scoped !== "all") people = people.filter((p) => scoped.includes(p.id));

  const { data: logsRaw } = await supabase
    .from("lead_status_logs")
    .select("to_status, assignee_id, changed_at, lead_id, lead_table")
    .eq("to_status", "1차컨택")
    .gte("changed_at", rangeStart)
    .lt("changed_at", rangeEnd);

  const logs = (logsRaw ?? []).filter((log) => {
    const id = String(log.lead_id ?? "");
    if (!id) return true;
    if (log.lead_table === "tylife_b2b") return !hiddenLeads.tylife_b2b.has(id);
    return !hiddenLeads.leads.has(id);
  });

  let contacted = 0;
  const contactStatuses = ["1차컨택", "부재(메신저완료)", "상담완료", "대면확정", "가입완료"] as const;
  for (const status of contactStatuses) {
    const { data: rows, error } = await supabase
      .from("lead_status_logs")
      .select("lead_id, lead_table")
      .eq("to_status", status)
      .gte("changed_at", rangeStart)
      .lt("changed_at", rangeEnd);
    if (error) {
      console.warn(`[dashboard] status count ${status}:`, error.message);
      continue;
    }
    for (const row of rows ?? []) {
      const id = String(row.lead_id ?? "");
      if (!id) {
        contacted += 1;
        continue;
      }
      if (row.lead_table === "tylife_b2b") {
        if (!hiddenLeads.tylife_b2b.has(id)) contacted += 1;
      } else if (!hiddenLeads.leads.has(id)) {
        contacted += 1;
      }
    }
  }

  let inbound = 0;
  for (const table of ["leads", "tylife_b2b"] as const) {
    let q = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", rangeStart)
      .lt("created_at", rangeEnd);
    const hiddenFilter = table === "tylife_b2b" ? hiddenCandidatesFilter : hiddenLeadsFilter;
    if (hiddenFilter) q = q.not("id", "in", hiddenFilter);
    const { count, error } = await q;
    if (error) {
      console.warn(`[dashboard] inbound count ${table}:`, error.message);
      continue;
    }
    inbound += count ?? 0;
  }

  const summary = {
    inbound,
    contacted,
    rate: inbound > 0 ? Math.round((contacted / inbound) * 1000) / 10 : null,
  };

  const assignedCounts = new Map<string, number>();
  for (const table of ["leads", "tylife_b2b"] as const) {
    let q = supabase
      .from(table)
      .select("id, assignee_id, assigned_at")
      .gte("assigned_at", rangeStart)
      .lt("assigned_at", rangeEnd);
    if (scoped !== "all") q = q.in("assignee_id", scoped);
    const hiddenFilter = table === "tylife_b2b" ? hiddenCandidatesFilter : hiddenLeadsFilter;
    if (hiddenFilter) q = q.not("id", "in", hiddenFilter);
    const { data } = await q;
    for (const row of data ?? []) {
      const id = String(row.assignee_id ?? "");
      if (!id) continue;
      assignedCounts.set(id, (assignedCounts.get(id) ?? 0) + 1);
    }
  }

  const dates: string[] = [];
  for (let d = from, i = 0; d <= to && i < 62; i += 1, d = addDaysYmd(d, 1)) {
    dates.push(d);
    if (d === to) break;
  }

  const contactByPersonDate = new Map<string, number>();
  for (const log of logs) {
    const day = kstYmd(new Date(log.changed_at));
    const key = `${log.assignee_id ?? ""}|${day}`;
    contactByPersonDate.set(key, (contactByPersonDate.get(key) ?? 0) + 1);
  }

  const by_date = dates.flatMap((date) =>
    people.map((p) => {
      const first_contact = contactByPersonDate.get(`${p.id}|${date}`) ?? 0;
      const assigned = assignedCounts.get(p.id) ?? 0;
      return {
        date,
        staff_id: p.id,
        staff_name: p.name,
        rank: p.rank,
        assigned,
        first_contact,
        first_contact_rate: assigned > 0 ? Math.round((first_contact / assigned) * 1000) / 10 : null,
      };
    })
  );

  const by_person = people.map((p) => {
    const assigned = assignedCounts.get(p.id) ?? 0;
    const first_contact = logs.filter((l) => l.assignee_id === p.id).length;
    return {
      staff_id: p.id,
      staff_name: p.name,
      rank: p.rank,
      assigned,
      first_contact,
      first_contact_rate: assigned > 0 ? Math.round((first_contact / assigned) * 1000) / 10 : null,
    };
  });

  return NextResponse.json({
    ok: true,
    date_from: from,
    date_to: to,
    summary,
    by_person,
    by_date,
  });
}

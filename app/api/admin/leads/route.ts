import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { loadStaffMaps } from "@/lib/crm/mapLead";
import { parseLeadQuery, queryLeads } from "@/lib/crm/queryLeads";
import { canSeeAdminStatus } from "@/lib/crm/scope";
import { allowedStatusesFor } from "@/lib/crm/status";
import { LEAD_STATUSES } from "@/lib/crm/types";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const q = parseLeadQuery(request.nextUrl.searchParams);
    const { items, total } = await queryLeads(session, q);
    const { staff } = await loadStaffMaps();
    const showAdmin = canSeeAdminStatus(session);
    const mapped = showAdmin ? items : items.map((row) => ({ ...row, admin_status: null }));
    const uniq = (key: "region" | "age_group" | "job" | "job_rank" | "entry_page" | "utm_source") =>
      Array.from(new Set(mapped.map((i) => String(i[key] ?? "")).filter(Boolean))).sort();

    return NextResponse.json({
      ok: true,
      items: mapped,
      total,
      session: { rank: session.rank, userId: session.userId, name: session.name },
      staff: staff.map((s) => ({ id: s.id, name: s.name, parent_id: s.parent_id })),
      statuses: [...LEAD_STATUSES],
      allowed_statuses: allowedStatusesFor(session, "대기"),
      options: {
        regions: uniq("region"),
        age_groups: uniq("age_group"),
        jobs: uniq("job"),
        job_ranks: uniq("job_rank"),
        entry_pages: uniq("entry_page"),
        utm_sources: uniq("utm_source"),
      },
    });
  } catch (e) {
    console.error("GET /api/admin/leads:", e);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

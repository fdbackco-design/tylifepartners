import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { addDaysYmd, kstYmd, startOfKstDayIso } from "@/lib/crm/kst";
import { loadStaffMaps } from "@/lib/crm/mapLead";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  const month = request.nextUrl.searchParams.get("month") || kstYmd().slice(0, 7);
  const assigneeId = request.nextUrl.searchParams.get("assignee_id") || "";
  const start = `${month}-01`;
  const nextMonth = `${addDaysYmd(start, 32).slice(0, 7)}-01`;
  const supabase = getSupabaseAdmin();
  const scoped = await visibleAssigneeIds(session);
  const { staffById, staff } = await loadStaffMaps();

  const fetchMeetings = async (table: "leads" | "tylife_b2b", kind: "consumers" | "candidates") => {
    let q = supabase
      .from(table)
      .select("id, name, phone, status, assignee_id, meeting_at, region")
      .gte("meeting_at", startOfKstDayIso(start))
      .lt("meeting_at", startOfKstDayIso(nextMonth))
      .not("meeting_at", "is", null)
      .order("meeting_at", { ascending: true });
    if (scoped !== "all") q = q.in("assignee_id", scoped);
    if (assigneeId) q = q.eq("assignee_id", assigneeId);
    const { data, error } = await q;
    if (error) {
      console.error("calendar", table, error);
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id,
      category: kind,
      name: r.name,
      phone: r.phone,
      status: r.status,
      region: r.region,
      assignee_id: r.assignee_id,
      assignee_name: r.assignee_id ? staffById.get(r.assignee_id)?.name ?? "" : "",
      meeting_at: r.meeting_at,
      date: r.meeting_at ? kstYmd(new Date(r.meeting_at)) : "",
    }));
  };

  const items = [...(await fetchMeetings("leads", "consumers")), ...(await fetchMeetings("tylife_b2b", "candidates"))];
  return NextResponse.json({
    ok: true,
    month,
    items,
    staff: session.rank === "sales" ? staff.filter((s) => s.id === session.userId) : staff,
  });
}

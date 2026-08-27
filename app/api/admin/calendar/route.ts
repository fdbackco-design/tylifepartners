import { NextRequest, NextResponse } from "next/server";
import {
  CALENDAR_EVENT_TYPES,
  canEditCalendar,
  canViewCalendarEvent,
  isCalendarEventType,
  isCalendarVisibility,
  normalizeVisibilityForWriter,
  parseEventDate,
  teamIdsForManager,
  type CalendarEventRow,
  type CalendarEventType,
  type CalendarVisibility,
} from "@/lib/crm/calendar";
import { addDaysYmd, kstYmd, startOfKstDayIso } from "@/lib/crm/kst";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { getSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffLite = {
  id: string;
  name: string;
  rank: string;
  parent_id: string | null;
  is_active: boolean;
};

function mapDbRow(
  r: Record<string, unknown>,
  staffById: Map<string, StaffLite>
): CalendarEventRow {
  const createdBy = r.created_by != null ? String(r.created_by) : null;
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    event_date: String(r.event_date).slice(0, 10),
    event_type: r.event_type as CalendarEventType,
    all_day: r.all_day !== false,
    start_at: r.start_at != null ? String(r.start_at) : null,
    end_at: r.end_at != null ? String(r.end_at) : null,
    visibility: r.visibility as CalendarVisibility,
    viewer_ids: Array.isArray(r.viewer_ids) ? r.viewer_ids.map(String) : [],
    created_by: createdBy,
    created_by_rank: (r.created_by_rank === "manager" ? "manager" : "admin") as "admin" | "manager",
    created_by_name: createdBy ? staffById.get(createdBy)?.name ?? "" : "",
    team_root_id: r.team_root_id != null ? String(r.team_root_id) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    source: "calendar",
    read_only: false,
  };
}

async function loadStaff(): Promise<StaffLite[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, name, rank, parent_id, is_active")
    .order("name");
  if (error) {
    console.error("calendar staff:", error);
    return [];
  }
  return (data ?? []) as StaffLite[];
}

async function fetchLeadMeetings(
  month: string,
  staffById: Map<string, StaffLite>
): Promise<CalendarEventRow[]> {
  const start = `${month}-01`;
  const nextMonth = `${addDaysYmd(start, 32).slice(0, 7)}-01`;
  const supabase = getSupabaseAdmin();

  const fetchTable = async (
    table: "leads" | "tylife_b2b",
    kind: "consumers" | "candidates"
  ): Promise<CalendarEventRow[]> => {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, phone, status, assignee_id, meeting_at")
      .or("merge_status.eq.active,merge_status.is.null")
      .gte("meeting_at", startOfKstDayIso(start))
      .lt("meeting_at", startOfKstDayIso(nextMonth))
      .not("meeting_at", "is", null)
      .order("meeting_at", { ascending: true });
    if (error) {
      console.error("calendar lead meetings", table, error);
      return [];
    }
    return (data ?? []).map((r) => {
      const date = r.meeting_at ? kstYmd(new Date(r.meeting_at)) : "";
      const assignee = r.assignee_id ? staffById.get(String(r.assignee_id)) : null;
      const title = `${r.name}${assignee ? ` · ${assignee.name}` : ""}`;
      return {
        id: `lead:${kind}:${r.id}`,
        title,
        body: `${r.name}\n${r.phone || ""}\n담당: ${assignee?.name || "미배정"}`,
        event_date: date,
        event_type: "meeting" as const,
        all_day: false,
        start_at: r.meeting_at ? String(r.meeting_at) : null,
        end_at: null,
        visibility: "all" as const,
        viewer_ids: [],
        created_by: null,
        created_by_rank: "admin" as const,
        created_by_name: "",
        team_root_id: null,
        created_at: "",
        updated_at: "",
        source: "lead_meeting" as const,
        lead_category: kind,
        lead_name: String(r.name ?? ""),
        lead_phone: String(r.phone ?? ""),
        assignee_id: r.assignee_id ? String(r.assignee_id) : null,
        assignee_name: assignee?.name ?? "",
        read_only: true,
      };
    });
  };

  const [a, b] = await Promise.all([
    fetchTable("leads", "consumers"),
    fetchTable("tylife_b2b", "candidates"),
  ]);
  return [...a, ...b];
}

function canViewLeadMeeting(
  session: Awaited<ReturnType<typeof getSession>>,
  ev: CalendarEventRow,
  scoped: string[] | "all"
): boolean {
  if (!session) return false;
  if (scoped === "all") return true;
  if (!ev.assignee_id) return session.rank === "admin";
  return scoped.includes(ev.assignee_id);
}

/**
 * GET /api/admin/calendar?month=YYYY-MM&types=lecture,general
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  const month = request.nextUrl.searchParams.get("month") || kstYmd().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ ok: false, message: "월 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const typesParam = request.nextUrl.searchParams.get("types") || "";
  const typeFilter = typesParam
    ? typesParam.split(",").map((s) => s.trim()).filter(isCalendarEventType)
    : [...CALENDAR_EVENT_TYPES];

  const start = `${month}-01`;
  const nextMonth = `${addDaysYmd(start, 32).slice(0, 7)}-01`;
  const supabase = getSupabaseAdmin();
  const staff = await loadStaff();
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select(
      "id, title, body, event_date, event_type, all_day, start_at, end_at, visibility, viewer_ids, created_by, created_by_rank, team_root_id, created_at, updated_at"
    )
    .gte("event_date", start)
    .lt("event_date", nextMonth)
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("GET calendar events:", error);
    return NextResponse.json({ ok: false, message: "일정을 불러오지 못했습니다." }, { status: 500 });
  }

  const calendarItems = ((data ?? []) as Record<string, unknown>[])
    .map((r) => mapDbRow(r, staffById))
    .filter((ev) => canViewCalendarEvent(session, ev, staff));

  // 대면확정일(리드) — 기존 meeting_at 호환. 스코프는 담당자 기준
  const scoped = await visibleAssigneeIds(session);
  const leadItems = (await fetchLeadMeetings(month, staffById)).filter((ev) =>
    canViewLeadMeeting(session, ev, scoped)
  );

  let items = [...calendarItems, ...leadItems].filter((ev) => typeFilter.includes(ev.event_type));
  items.sort((a, b) => {
    const d = a.event_date.localeCompare(b.event_date);
    if (d !== 0) return d;
    const at = a.start_at || "";
    const bt = b.start_at || "";
    if (at !== bt) return at.localeCompare(bt);
    return a.title.localeCompare(b.title, "ko");
  });

  const viewerOptions =
    session.rank === "admin"
      ? {
          managers: staff.filter((s) => s.rank === "manager" && s.is_active),
          sales: staff.filter((s) => s.rank === "sales" && s.is_active),
        }
      : session.rank === "manager" && session.userId
        ? (() => {
            const team = teamIdsForManager(session.userId!, staff);
            return {
              managers: [] as StaffLite[],
              sales: staff.filter((s) => s.rank === "sales" && s.is_active && team.has(s.id)),
            };
          })()
        : { managers: [] as StaffLite[], sales: [] as StaffLite[] };

  return NextResponse.json({
    ok: true,
    month,
    can_edit: canEditCalendar(session),
    items,
    viewer_options: viewerOptions,
    me: { userId: session.userId, rank: session.rank, name: session.name },
  });
}

/**
 * POST /api/admin/calendar — 일정 생성 (관리자·매니저)
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canEditCalendar(session)) {
    return NextResponse.json({ ok: false, message: "일정 작성 권한이 없습니다." }, { status: 403 });
  }
  if (session.rank === "manager" && !session.userId) {
    return NextResponse.json({ ok: false, message: "일정 작성 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const eventDate = parseEventDate(body.event_date);
    if (!eventDate) {
      return NextResponse.json({ ok: false, message: "날짜가 올바르지 않습니다." }, { status: 400 });
    }
    if (!isCalendarEventType(body.event_type)) {
      return NextResponse.json({ ok: false, message: "일정 종류가 올바르지 않습니다." }, { status: 400 });
    }
    if (!isCalendarVisibility(body.visibility)) {
      return NextResponse.json({ ok: false, message: "열람 권한이 올바르지 않습니다." }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!title && !text) {
      return NextResponse.json({ ok: false, message: "제목 또는 내용을 입력해 주세요." }, { status: 400 });
    }

    const staff = await loadStaff();
    const vis = normalizeVisibilityForWriter(
      session,
      body.visibility,
      Array.isArray(body.viewer_ids) ? body.viewer_ids.map(String) : [],
      staff
    );
    if (!vis.ok) {
      return NextResponse.json({ ok: false, message: vis.message }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("crm_calendar_events")
      .insert({
        title: title || text.split("\n")[0].slice(0, 80),
        body: text,
        event_date: eventDate,
        event_type: body.event_type,
        all_day: body.all_day !== false,
        start_at: body.start_at || null,
        end_at: body.end_at || null,
        visibility: vis.visibility,
        viewer_ids: vis.viewer_ids,
        created_by: session.userId,
        created_by_rank: session.rank === "manager" ? "manager" : "admin",
        team_root_id: vis.team_root_id,
        updated_at: new Date().toISOString(),
      })
      .select(
        "id, title, body, event_date, event_type, all_day, start_at, end_at, visibility, viewer_ids, created_by, created_by_rank, team_root_id, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("POST calendar:", error);
      return NextResponse.json({ ok: false, message: "일정 저장에 실패했습니다." }, { status: 500 });
    }

    const staffById = new Map(staff.map((s) => [s.id, s]));
    return NextResponse.json({ ok: true, item: mapDbRow(data as Record<string, unknown>, staffById) });
  } catch (e) {
    console.error("POST /api/admin/calendar:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

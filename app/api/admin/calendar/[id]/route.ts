import { NextRequest, NextResponse } from "next/server";
import {
  canEditCalendar,
  canMutateEvent,
  canViewCalendarEvent,
  isCalendarEventType,
  isCalendarVisibility,
  normalizeVisibilityForWriter,
  parseEventDate,
  type CalendarEventRow,
  type CalendarEventType,
  type CalendarVisibility,
} from "@/lib/crm/calendar";
import { getSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffLite = {
  id: string;
  name: string;
  rank: string;
  parent_id: string | null;
  is_active: boolean;
};

function mapDbRow(r: Record<string, unknown>, staffById: Map<string, StaffLite>): CalendarEventRow {
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
  const { data } = await supabase.from("staff_users").select("id, name, rank, parent_id, is_active");
  return (data ?? []) as StaffLite[];
}

async function loadEvent(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select(
      "id, title, body, event_date, event_type, all_day, start_at, end_at, visibility, viewer_ids, created_by, created_by_rank, team_root_id, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  return { data, error };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canEditCalendar(session)) {
    return NextResponse.json({ ok: false, message: "일정 수정 권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.startsWith("lead:")) {
    return NextResponse.json({ ok: false, message: "대면확정일(고객)은 고객 DB에서 수정해 주세요." }, { status: 400 });
  }

  const staff = await loadStaff();
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const { data: existing, error: loadErr } = await loadEvent(id);
  if (loadErr || !existing) {
    return NextResponse.json({ ok: false, message: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  const row = mapDbRow(existing as Record<string, unknown>, staffById);
  if (!canViewCalendarEvent(session, row, staff) || !canMutateEvent(session, row)) {
    return NextResponse.json({ ok: false, message: "일정을 수정할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.event_date != null) {
      const d = parseEventDate(body.event_date);
      if (!d) return NextResponse.json({ ok: false, message: "날짜가 올바르지 않습니다." }, { status: 400 });
      patch.event_date = d;
    }
    if (body.event_type != null) {
      if (!isCalendarEventType(body.event_type)) {
        return NextResponse.json({ ok: false, message: "일정 종류가 올바르지 않습니다." }, { status: 400 });
      }
      patch.event_type = body.event_type;
    }
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.body != null) patch.body = String(body.body);
    if (body.all_day != null) patch.all_day = Boolean(body.all_day);
    if (body.start_at !== undefined) patch.start_at = body.start_at || null;
    if (body.end_at !== undefined) patch.end_at = body.end_at || null;

    if (body.visibility != null || body.viewer_ids != null) {
      const visibility = isCalendarVisibility(body.visibility) ? body.visibility : row.visibility;
      if (!isCalendarVisibility(visibility)) {
        return NextResponse.json({ ok: false, message: "열람 권한이 올바르지 않습니다." }, { status: 400 });
      }
      const vis = normalizeVisibilityForWriter(
        session,
        visibility,
        Array.isArray(body.viewer_ids) ? body.viewer_ids.map(String) : row.viewer_ids,
        staff
      );
      if (!vis.ok) {
        return NextResponse.json({ ok: false, message: vis.message }, { status: 400 });
      }
      patch.visibility = vis.visibility;
      patch.viewer_ids = vis.viewer_ids;
      patch.team_root_id = vis.team_root_id;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("crm_calendar_events")
      .update(patch)
      .eq("id", id)
      .select(
        "id, title, body, event_date, event_type, all_day, start_at, end_at, visibility, viewer_ids, created_by, created_by_rank, team_root_id, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("PATCH calendar:", error);
      return NextResponse.json({ ok: false, message: "일정 수정에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: mapDbRow(data as Record<string, unknown>, staffById) });
  } catch (e) {
    console.error("PATCH /api/admin/calendar/[id]:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canEditCalendar(session)) {
    return NextResponse.json({ ok: false, message: "일정 삭제 권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.startsWith("lead:")) {
    return NextResponse.json({ ok: false, message: "대면확정일(고객)은 삭제할 수 없습니다." }, { status: 400 });
  }

  const staff = await loadStaff();
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const { data: existing, error: loadErr } = await loadEvent(id);
  if (loadErr || !existing) {
    return NextResponse.json({ ok: false, message: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  const row = mapDbRow(existing as Record<string, unknown>, staffById);
  if (!canViewCalendarEvent(session, row, staff) || !canMutateEvent(session, row)) {
    return NextResponse.json({ ok: false, message: "일정을 삭제할 권한이 없습니다." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("crm_calendar_events").delete().eq("id", id);
  if (error) {
    console.error("DELETE calendar:", error);
    return NextResponse.json({ ok: false, message: "일정 삭제에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

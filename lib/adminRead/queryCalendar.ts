import {
  CALENDAR_EVENT_TYPES,
  canViewCalendarEvent,
  isCalendarEventType,
  type CalendarEventRow,
  type CalendarEventType,
} from "@/lib/crm/calendar";
import { addDaysYmd, kstYmd, startOfKstDayIso } from "@/lib/crm/kst";
import { ADMIN_READ_SESSION } from "@/lib/adminRead/session";
import { listGoogleCalendarEvents } from "@/lib/googleCalendar";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffLite = { id: string; name: string; rank: string; parent_id: string | null; is_active: boolean };

async function loadStaff(): Promise<StaffLite[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("staff_users").select("id, name, rank, parent_id, is_active").order("name");
  return (data ?? []) as StaffLite[];
}

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
    visibility: r.visibility as CalendarEventRow["visibility"],
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

async function fetchLeadMeetings(month: string, staffById: Map<string, StaffLite>): Promise<CalendarEventRow[]> {
  const start = `${month}-01`;
  const nextMonth = `${addDaysYmd(start, 32).slice(0, 7)}-01`;
  const supabase = getSupabaseAdmin();

  const fetchTable = async (table: "leads" | "tylife_b2b", kind: "consumers" | "candidates") => {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, phone, status, assignee_id, meeting_at")
      .or("merge_status.eq.active,merge_status.is.null")
      .in("status", ["대면확정", "통화약속"])
      .gte("meeting_at", startOfKstDayIso(start))
      .lt("meeting_at", startOfKstDayIso(nextMonth))
      .not("meeting_at", "is", null)
      .order("meeting_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r) => {
      const date = r.meeting_at ? kstYmd(new Date(r.meeting_at)) : "";
      const assignee = r.assignee_id ? staffById.get(String(r.assignee_id)) : null;
      const isCall = String(r.status) === "통화약속";
      return {
        id: `lead:${kind}:${r.id}`,
        title: isCall ? String(r.name ?? "") : `${r.name}${assignee ? ` · ${assignee.name}` : ""}`,
        body: `${r.name}\n${r.phone || ""}\n담당: ${assignee?.name || "미배정"}`,
        event_date: date,
        event_type: (isCall ? "call" : "meeting") as CalendarEventType,
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

  const fetchTm = async (kind: "tm001" | "tm002") => {
    const { data, error } = await supabase
      .from(`${kind}_customers`)
      .select("id, name, phone, status, assignee_id, meeting_at")
      .eq("status", "재콜")
      .gte("meeting_at", startOfKstDayIso(start))
      .lt("meeting_at", startOfKstDayIso(nextMonth))
      .not("meeting_at", "is", null)
      .order("meeting_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r) => {
      const date = r.meeting_at ? kstYmd(new Date(r.meeting_at)) : "";
      const assignee = r.assignee_id ? staffById.get(String(r.assignee_id)) : null;
      return {
        id: `lead:${kind}:${r.id}`,
        title: String(r.name ?? ""),
        body: `${r.name}\n${r.phone || ""}\n담당: ${assignee?.name || "미배정"}\n${kind.toUpperCase()} 재콜`,
        event_date: date,
        event_type: "call" as const,
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

  const [a, b, c, d] = await Promise.all([
    fetchTable("leads", "consumers"),
    fetchTable("tylife_b2b", "candidates"),
    fetchTm("tm001"),
    fetchTm("tm002"),
  ]);
  return [...a, ...b, ...c, ...d];
}

export async function queryAdminReadCalendar(month: string, typesParam: string): Promise<CalendarEventRow[]> {
  const typeFilter = typesParam
    ? typesParam.split(",").map((s) => s.trim()).filter(isCalendarEventType)
    : [...CALENDAR_EVENT_TYPES];

  const start = `${month}-01`;
  const nextMonth = `${addDaysYmd(start, 32).slice(0, 7)}-01`;
  const staff = await loadStaff();
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select(
      "id, title, body, event_date, event_type, all_day, start_at, end_at, visibility, viewer_ids, created_by, created_by_rank, team_root_id, created_at, updated_at"
    )
    .gte("event_date", start)
    .lt("event_date", nextMonth)
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const calendarItems = ((data ?? []) as Record<string, unknown>[])
    .map((r) => mapDbRow(r, staffById))
    .filter((ev) => canViewCalendarEvent(ADMIN_READ_SESSION, ev, staff));

  let items = [...calendarItems, ...(await fetchLeadMeetings(month, staffById))].filter((ev) =>
    typeFilter.includes(ev.event_type)
  );

  if (typeFilter.includes("google")) {
    try {
      items.push(...(await listGoogleCalendarEvents(month)));
    } catch (e) {
      console.warn("[admin-read-api] google calendar:", e instanceof Error ? e.message : e);
    }
  }

  items.sort((a, b) => {
    const d = a.event_date.localeCompare(b.event_date);
    if (d !== 0) return d;
    return (a.start_at || "").localeCompare(b.start_at || "") || a.title.localeCompare(b.title, "ko");
  });

  return items;
}

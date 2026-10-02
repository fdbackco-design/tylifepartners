import { addDaysYmd } from "@/lib/crm/kst";
import type { PartnerApiPermissions, PartnerPublicCalendarEvent } from "@/lib/partner/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function mapRow(row: Record<string, unknown>): PartnerPublicCalendarEvent {
  const title = String(row.title ?? "").trim();
  return {
    id: String(row.id),
    event_date: String(row.event_date ?? ""),
    event_type: String(row.event_type ?? ""),
    all_day: Boolean(row.all_day),
    start_at: row.start_at ? String(row.start_at) : null,
    end_at: row.end_at ? String(row.end_at) : null,
    title: title || "(제목 없음)",
  };
}

export async function queryPartnerCalendarEvents(
  permissions: PartnerApiPermissions,
  month: string
): Promise<PartnerPublicCalendarEvent[]> {
  const start = `${month}-01`;
  const nextMonth = `${addDaysYmd(start, 32).slice(0, 7)}-01`;
  const allowedTypes = permissions.calendar_event_types.filter(
    (t) => t !== "google" && t !== "meeting" && t !== "call"
  );
  if (!allowedTypes.length) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select("id, title, event_date, event_type, all_day, start_at, end_at, visibility, created_by_rank")
    .gte("event_date", start)
    .lt("event_date", nextMonth)
    .eq("visibility", "all")
    .eq("created_by_rank", "admin")
    .in("event_type", allowedTypes)
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

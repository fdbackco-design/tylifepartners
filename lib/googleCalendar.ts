import type { CalendarEventRow } from "@/lib/crm/calendar";
import { addDaysYmd, kstYmd } from "@/lib/crm/kst";

/** 관리자 전용으로 읽는 구글 캘린더 (fdbackco@gmail.com 공용 일정). */
export const DEFAULT_GOOGLE_CALENDAR_ID =
  "92323d979db62c0a186688dcb28076406c8cd022d062765bda0ddb58030b3554@group.calendar.google.com";

const CACHE_MS = 60_000;

type Cache = { key: string; at: number; items: CalendarEventRow[] };
let cache: Cache | null = null;

function env(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  return t ? t : null;
}

export function googleCalendarId(): string {
  return env("GOOGLE_CALENDAR_ID") || DEFAULT_GOOGLE_CALENDAR_ID;
}

function icsUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function unescapeText(raw: string): string {
  return raw
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function prop(block: string, name: string): { value: string; params: string } | null {
  const re = new RegExp(`^${name}(?:;([^:]*))?:(.*)$`, "im");
  const m = block.match(re);
  if (!m) return null;
  return { params: m[1] || "", value: m[2].trim() };
}

function parseGoogleDate(value: string, params: string): { ymd: string; iso: string | null; allDay: boolean } | null {
  if (/^\d{8}$/.test(value)) {
    const ymd = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return { ymd, iso: null, allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const ymd = `${y}-${mo}-${d}`;
  if (z) {
    const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
    return { ymd: kstYmd(date), iso: date.toISOString(), allDay: false };
  }
  const tz = /TZID=([^;:]+)/i.exec(params)?.[1] || "Asia/Seoul";
  if (tz === "Asia/Seoul") {
    const date = new Date(`${ymd}T${h}:${mi}:${s}+09:00`);
    return { ymd, iso: date.toISOString(), allDay: false };
  }
  const date = new Date(`${ymd}T${h}:${mi}:${s}Z`);
  return { ymd: kstYmd(date), iso: date.toISOString(), allDay: false };
}

function daysOf(startYmd: string, endYmdExclusive: string | null, allDay: boolean): string[] {
  if (!endYmdExclusive || endYmdExclusive <= startYmd) return [startYmd];
  const days: string[] = [];
  let cur = startYmd;
  const last = allDay ? addDaysYmd(endYmdExclusive, -1) : endYmdExclusive;
  while (cur <= last && days.length < 31) {
    days.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return days.length ? days : [startYmd];
}

function parseIcs(ics: string, month: string): CalendarEventRow[] {
  const text = unfold(ics);
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const now = new Date().toISOString();
  const items: CalendarEventRow[] = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  for (const raw of blocks) {
    const block = raw.split("END:VEVENT")[0] || "";
    const status = prop(block, "STATUS")?.value.toUpperCase();
    if (status === "CANCELLED") continue;
    const dtStart = prop(block, "DTSTART");
    if (!dtStart) continue;
    const startAt = parseGoogleDate(dtStart.value, dtStart.params);
    if (!startAt) continue;
    const dtEnd = prop(block, "DTEND");
    const endAt = dtEnd ? parseGoogleDate(dtEnd.value, dtEnd.params) : null;
    const title = unescapeText(prop(block, "SUMMARY")?.value || "").trim() || "(제목 없음)";
    const body = unescapeText(prop(block, "DESCRIPTION")?.value || "").trim();
    const uid = prop(block, "UID")?.value || `${startAt.ymd}:${title}`;
    const created = prop(block, "CREATED");
    const updated = prop(block, "LAST-MODIFIED");
    const days = daysOf(startAt.ymd, endAt?.ymd ?? null, startAt.allDay);
    days.forEach((ymd, index) => {
      if (ymd < start || ymd >= next) return;
      items.push({
        id: `gcal:${uid}:${ymd}:${index}`,
        title,
        body,
        event_date: ymd,
        event_type: "google",
        all_day: startAt.allDay,
        start_at: startAt.allDay ? null : startAt.iso,
        end_at: startAt.allDay ? null : endAt?.iso ?? null,
        visibility: "admin_plus",
        viewer_ids: [],
        created_by: null,
        created_by_rank: "admin",
        team_root_id: null,
        created_at: created ? parseGoogleDate(created.value, created.params)?.iso || now : now,
        updated_at: updated ? parseGoogleDate(updated.value, updated.params)?.iso || now : now,
        source: "google_calendar",
        read_only: true,
      });
    });
  }
  return items;
}

/** 해당 월(KST)의 구글 캘린더 일정. 공개 iCal을 읽으며 실패 시 예외. */
export async function listGoogleCalendarEvents(month: string): Promise<CalendarEventRow[]> {
  const key = `${googleCalendarId()}:${month}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.items;

  const res = await fetch(icsUrl(googleCalendarId()), { cache: "no-store" });
  if (!res.ok) throw new Error(`google calendar ${res.status}`);
  const ics = await res.text();
  const items = parseIcs(ics, month);
  cache = { key, at: Date.now(), items };
  return items;
}

import type { SessionUser, StaffRank } from "@/lib/crm/types";
import { descendantAssigneeIds } from "@/lib/crm/scope";

export const CALENDAR_EVENT_TYPES = [
  "lecture",
  "general",
  "important",
  "deadline",
  "holiday",
  "meeting",
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  lecture: "강의",
  general: "일반",
  important: "중요",
  deadline: "마감",
  holiday: "휴무",
  meeting: "대면일",
};

/** HTML 디자인 토큰에 맞춘 색상 */
export const CALENDAR_EVENT_TYPE_COLORS: Record<
  CalendarEventType,
  { accent: string; bg: string; text: string }
> = {
  lecture: { accent: "#410099", bg: "rgba(65,0,153,.08)", text: "#410099" },
  general: { accent: "#D8CFEC", bg: "#FFFFFF", text: "#33254D" },
  important: { accent: "#6706FF", bg: "rgba(103,6,255,.06)", text: "#6706FF" },
  deadline: { accent: "#25C55E", bg: "rgba(74,255,134,.20)", text: "#0C7A38" },
  holiday: { accent: "#CFC7E0", bg: "#FAF9FC", text: "#867A9C" },
  meeting: { accent: "#5A13BF", bg: "rgba(90,19,191,.08)", text: "#5A13BF" },
};

export const CALENDAR_VISIBILITIES = ["all", "admin_plus", "managers", "sales"] as const;
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number];

export const CALENDAR_VISIBILITY_LABELS: Record<CalendarVisibility, string> = {
  all: "전체 열람",
  admin_plus: "관리자 이상 열람",
  managers: "특정 매니저 열람",
  sales: "특정 영업자 열람",
};

export type CalendarEventRow = {
  id: string;
  title: string;
  body: string;
  event_date: string;
  event_type: CalendarEventType;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  visibility: CalendarVisibility;
  viewer_ids: string[];
  created_by: string | null;
  created_by_rank: "admin" | "manager";
  created_by_name?: string;
  team_root_id: string | null;
  created_at: string;
  updated_at: string;
  /** lead 대면일 가상 일정 */
  source?: "calendar" | "lead_meeting";
  lead_category?: "consumers" | "candidates";
  lead_name?: string;
  lead_phone?: string;
  assignee_id?: string | null;
  assignee_name?: string;
  read_only?: boolean;
};

export function isCalendarEventType(v: unknown): v is CalendarEventType {
  return typeof v === "string" && (CALENDAR_EVENT_TYPES as readonly string[]).includes(v);
}

export function isCalendarVisibility(v: unknown): v is CalendarVisibility {
  return typeof v === "string" && (CALENDAR_VISIBILITIES as readonly string[]).includes(v);
}

export function canEditCalendar(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

/** ENV 관리자(userId 없음)도 관리자 작성으로 취급 */
export function writerRank(session: SessionUser): "admin" | "manager" | null {
  if (session.rank === "admin") return "admin";
  if (session.rank === "manager" && session.userId) return "manager";
  return null;
}

export function eventTitle(ev: Pick<CalendarEventRow, "title" | "body" | "lead_name" | "source">): string {
  const t = String(ev.title ?? "").trim();
  if (t) return t;
  if (ev.source === "lead_meeting" && ev.lead_name) return ev.lead_name;
  const first = String(ev.body ?? "")
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  return first || "(제목 없음)";
}

type StaffLite = { id: string; parent_id: string | null; rank: string; is_active?: boolean };

/** 매니저 팀(본인+산하) id 집합 */
export function teamIdsForManager(managerId: string, staff: StaffLite[]): Set<string> {
  return new Set(descendantAssigneeIds(managerId, staff));
}

/**
 * 세션 사용자가 일정을 열람할 수 있는지.
 * - 매니저 작성 일정은 관리자에게 절대 비공개
 * - 작성자는 항상 열람 가능
 */
export function canViewCalendarEvent(
  session: SessionUser,
  ev: Pick<
    CalendarEventRow,
    "created_by" | "created_by_rank" | "visibility" | "viewer_ids" | "team_root_id"
  >,
  staff: StaffLite[]
): boolean {
  if (session.userId && ev.created_by && session.userId === ev.created_by) return true;

  // 매니저 작성 → 관리자 제외
  if (ev.created_by_rank === "manager" && session.rank === "admin") return false;

  // 관리자 작성 일정은 관리자끼리 모두 열람 (ENV 관리자 포함)
  if (ev.created_by_rank === "admin" && session.rank === "admin") return true;

  if (ev.created_by_rank === "manager") {
    const root = ev.team_root_id || ev.created_by;
    if (!root || !session.userId) return false;
    const team = teamIdsForManager(root, staff);
    if (!team.has(session.userId)) return false;

    if (ev.visibility === "all") return true;
    if (ev.visibility === "sales") {
      return (ev.viewer_ids ?? []).includes(session.userId);
    }
    return false;
  }

  // 관리자 작성 → 매니저/영업자 열람 규칙
  switch (ev.visibility) {
    case "all":
      return true;
    case "admin_plus":
      return false; // 관리자는 위에서 이미 true
    case "managers":
      return (
        session.rank === "manager" &&
        !!session.userId &&
        (ev.viewer_ids ?? []).includes(session.userId)
      );
    case "sales":
      return (
        session.rank === "sales" &&
        !!session.userId &&
        (ev.viewer_ids ?? []).includes(session.userId)
      );
    default:
      return false;
  }
}

/** 생성/수정 시 열람 범위 정규화 + 권한 검증 */
export function normalizeVisibilityForWriter(
  session: SessionUser,
  visibility: CalendarVisibility,
  viewerIds: string[],
  staff: StaffLite[]
): { ok: true; visibility: CalendarVisibility; viewer_ids: string[]; team_root_id: string | null } | { ok: false; message: string } {
  const unique = Array.from(new Set(viewerIds.filter(Boolean)));

  if (session.rank === "admin") {
    if (visibility === "all" || visibility === "admin_plus") {
      return { ok: true, visibility, viewer_ids: [], team_root_id: null };
    }
    if (visibility === "managers") {
      const managers = unique.filter((id) => {
        const s = staff.find((x) => x.id === id);
        return s && s.rank === "manager" && s.is_active !== false;
      });
      if (!managers.length) return { ok: false, message: "열람할 매니저를 한 명 이상 선택해 주세요." };
      return { ok: true, visibility, viewer_ids: managers, team_root_id: null };
    }
    if (visibility === "sales") {
      const sales = unique.filter((id) => {
        const s = staff.find((x) => x.id === id);
        return s && s.rank === "sales" && s.is_active !== false;
      });
      if (!sales.length) return { ok: false, message: "열람할 영업자를 한 명 이상 선택해 주세요." };
      return { ok: true, visibility, viewer_ids: sales, team_root_id: null };
    }
    return { ok: false, message: "열람 권한이 올바르지 않습니다." };
  }

  if (session.rank === "manager") {
    if (!session.userId) return { ok: false, message: "세션이 올바르지 않습니다." };
    const team = teamIdsForManager(session.userId, staff);
    // 관리자 공개·타 매니저 지정 불가
    if (visibility === "admin_plus" || visibility === "managers") {
      return { ok: false, message: "매니저는 관리자·다른 매니저 열람으로 설정할 수 없습니다." };
    }
    if (visibility === "all") {
      return { ok: true, visibility: "all", viewer_ids: [], team_root_id: session.userId };
    }
    if (visibility === "sales") {
      const sales = unique.filter((id) => {
        if (!team.has(id)) return false;
        const s = staff.find((x) => x.id === id);
        return s && s.rank === "sales" && s.is_active !== false;
      });
      if (!sales.length) {
        return { ok: false, message: "본인 팀 소속 영업자를 한 명 이상 선택해 주세요." };
      }
      return { ok: true, visibility: "sales", viewer_ids: sales, team_root_id: session.userId };
    }
    return { ok: false, message: "열람 권한이 올바르지 않습니다." };
  }

  return { ok: false, message: "일정 작성 권한이 없습니다." };
}

export function canMutateEvent(
  session: SessionUser,
  ev: Pick<CalendarEventRow, "created_by" | "created_by_rank" | "team_root_id">
): boolean {
  if (!canEditCalendar(session)) return false;
  if (session.rank === "admin") {
    return ev.created_by_rank === "admin";
  }
  if (!session.userId) return false;
  return ev.created_by === session.userId;
}

export function parseEventDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

export function staffRankLabel(rank: StaffRank): string {
  if (rank === "admin") return "관리자";
  if (rank === "manager") return "매니저";
  return "영업자";
}

/**
 * 일정 등록 알림 대상 staff id (작성자 본인 제외).
 * canViewCalendarEvent 규칙과 동일하게 열람 가능자만 포함.
 */
export function resolveCalendarNotifyStaffIds(
  ev: Pick<
    CalendarEventRow,
    "created_by" | "created_by_rank" | "visibility" | "viewer_ids" | "team_root_id"
  >,
  staff: StaffLite[]
): string[] {
  const active = staff.filter((s) => s.is_active !== false);
  const exclude = new Set(ev.created_by ? [ev.created_by] : []);
  let ids: string[] = [];

  if (ev.created_by_rank === "manager") {
    const root = ev.team_root_id || ev.created_by;
    if (!root) return [];
    const team = teamIdsForManager(root, active);
    if (ev.visibility === "all") {
      ids = active.filter((s) => team.has(s.id)).map((s) => s.id);
    } else if (ev.visibility === "sales") {
      ids = (ev.viewer_ids ?? []).filter((id) => {
        const s = active.find((x) => x.id === id);
        return Boolean(s && s.rank === "sales" && team.has(id));
      });
    }
  } else {
    if (ev.visibility === "all") {
      ids = active.map((s) => s.id);
    } else if (ev.visibility === "admin_plus") {
      ids = active.filter((s) => s.rank === "admin").map((s) => s.id);
    } else if (ev.visibility === "managers") {
      ids = (ev.viewer_ids ?? []).filter((id) => active.some((s) => s.id === id && s.rank === "manager"));
    } else if (ev.visibility === "sales") {
      ids = (ev.viewer_ids ?? []).filter((id) => active.some((s) => s.id === id && s.rank === "sales"));
    }
  }

  return Array.from(new Set(ids.filter((id) => !exclude.has(id))));
}

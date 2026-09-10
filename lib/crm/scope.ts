import { getSupabaseAdmin } from "@/lib/supabase";
import type { SessionUser } from "@/lib/crm/types";

/** parent_id 트리에서 root 본인 + 모든 산하 id */
export function descendantAssigneeIds(
  rootId: string,
  staff: Array<{ id: string; parent_id: string | null }>
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const row of staff) {
    if (!row.parent_id) continue;
    const list = childrenByParent.get(row.parent_id) ?? [];
    list.push(row.id);
    childrenByParent.set(row.parent_id, list);
  }
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      stack.push(child);
    }
  }
  return Array.from(ids);
}

export async function visibleAssigneeIds(session: SessionUser): Promise<string[] | "all"> {
  if (session.rank === "admin") return "all";
  if (!session.userId) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("staff_users").select("id, parent_id");
  if (error) {
    console.error("visibleAssigneeIds:", error);
    return [session.userId];
  }
  return descendantAssigneeIds(session.userId, data ?? []);
}

/** loadStaffMaps 결과로 스코프 계산 — staff_users 재조회 방지 */
export function visibleAssigneeIdsFromStaff(
  session: SessionUser,
  staff: Array<{ id: string; parent_id: string | null }>
): string[] | "all" {
  if (session.rank === "admin") return "all";
  if (!session.userId) return [];
  return descendantAssigneeIds(session.userId, staff);
}

/** TM001 목록 스코프 — admin·TM관리자는 전체, 그 외 본인+산하 */
export function tm001VisibleAssigneeIdsFromStaff(
  session: SessionUser,
  staff: Array<{ id: string; parent_id: string | null }>
): string[] | "all" {
  if (session.rank === "admin" || session.rank === "tm_admin") return "all";
  return visibleAssigneeIdsFromStaff(session, staff);
}

export async function tm001VisibleAssigneeIds(session: SessionUser): Promise<string[] | "all"> {
  if (session.rank === "admin" || session.rank === "tm_admin") return "all";
  return visibleAssigneeIds(session);
}

/** TM001 담당자 변경 — TM001 접근 가능 직급 (대상은 스코프로 제한) */
export function canChangeTm001Assignee(session: SessionUser): boolean {
  return canAccessTm001(session);
}

/** 미배정(null) 포함 배정 가능 여부 */
export function canAssignTm001To(
  session: SessionUser,
  assigneeId: string | null,
  scoped: string[] | "all"
): boolean {
  if (assigneeId == null) {
    return session.rank === "admin" || session.rank === "tm_admin";
  }
  if (scoped === "all") return true;
  return scoped.includes(assigneeId);
}

export function canManageAccounts(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

export function canSeeAdminStatus(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

export function canChangeAssignee(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

export function canAccessTm001(session: Pick<SessionUser, "rank">): boolean {
  return (
    session.rank === "admin" ||
    session.rank === "manager" ||
    session.rank === "sales" ||
    session.rank === "tm_admin"
  );
}

export function canEditAdminComment(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

/** Meta 개별 DB 추정 비용(CPL) — 관리자만 */
export function canSeeMetaAdSpend(session: SessionUser): boolean {
  return session.rank === "admin";
}

/** 소비자·후보자·담당자 변경 필요 DB 내보내기 — 관리자만 */
export function canExportLeads(session: Pick<SessionUser, "rank">): boolean {
  return session.rank === "admin";
}

/** 소비자/후보자 CRM API — TM관리자 제외 */
export function canAccessCrmLeads(session: Pick<SessionUser, "rank">): boolean {
  return session.rank === "admin" || session.rank === "manager" || session.rank === "sales";
}

/** CRM 탭·보조 메뉴 접근 가능 여부 */
export function canAccessAdminPath(rank: SessionUser["rank"], pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;

  if (rank === "admin") return true;

  if (rank === "tm_admin") {
    const allowed = ["/admin/tm001", "/admin/password"];
    return allowed.some((p) => path === p || path.startsWith(`${p}/`));
  }

  const allowed =
    rank === "manager"
      ? [
          "/admin/consumers",
          "/admin/candidates",
          "/admin/tm001",
          "/admin/reassign",
          "/admin/calendar",
          "/admin/resources",
          "/admin/accounts",
          "/admin/password",
        ]
      : [
          "/admin/consumers",
          "/admin/candidates",
          "/admin/tm001",
          "/admin/calendar",
          "/admin/resources",
          "/admin/password",
        ];

  return allowed.some((p) => path === p || path.startsWith(`${p}/`));
}

export function defaultAdminHome(rank: SessionUser["rank"]): string {
  if (rank === "admin") return "/admin/dashboard";
  if (rank === "tm_admin") return "/admin/tm001";
  return "/admin/consumers";
}

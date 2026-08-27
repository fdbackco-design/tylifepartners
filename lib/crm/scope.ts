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

export function canManageAccounts(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

export function canSeeAdminStatus(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

export function canChangeAssignee(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

export function canEditAdminComment(session: SessionUser): boolean {
  return session.rank === "admin" || session.rank === "manager";
}

/** CRM 탭·보조 메뉴 접근 가능 여부 */
export function canAccessAdminPath(rank: SessionUser["rank"], pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;

  if (rank === "admin") return true;

  const allowed =
    rank === "manager"
      ? [
          "/admin/consumers",
          "/admin/candidates",
          "/admin/reassign",
          "/admin/calendar",
          "/admin/accounts",
          "/admin/password",
        ]
      : ["/admin/consumers", "/admin/candidates", "/admin/calendar", "/admin/password"];

  return allowed.some((p) => path === p || path.startsWith(`${p}/`));
}

export function defaultAdminHome(rank: SessionUser["rank"]): string {
  return rank === "admin" ? "/admin/dashboard" : "/admin/consumers";
}

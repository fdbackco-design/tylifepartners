import { getSupabaseAdmin } from "@/lib/supabase";
import type { SessionUser } from "@/lib/crm/types";

export async function visibleAssigneeIds(session: SessionUser): Promise<string[] | "all"> {
  if (session.rank === "admin") return "all";
  if (!session.userId) return [];
  if (session.rank === "sales") return [session.userId];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("staff_users").select("id").eq("parent_id", session.userId);
  if (error) {
    console.error("visibleAssigneeIds:", error);
    return [session.userId];
  }
  return [session.userId, ...(data ?? []).map((r) => r.id as string)];
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
        ]
      : ["/admin/consumers", "/admin/candidates", "/admin/calendar"];

  return allowed.some((p) => path === p || path.startsWith(`${p}/`));
}

export function defaultAdminHome(rank: SessionUser["rank"]): string {
  return rank === "admin" ? "/admin/dashboard" : "/admin/consumers";
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { canManageAccounts } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SessionUser } from "@/lib/crm/types";

type StaffRow = {
  id: string;
  name: string;
  rank: string;
  parent_id: string | null;
  is_active: boolean;
};

function canDeactivateTarget(session: SessionUser, target: StaffRow): boolean {
  if (!target.is_active) return false;
  if (session.userId && session.userId === target.id) return false;
  if (session.rank === "admin") return true;
  if (session.rank === "manager" && session.userId) {
    return target.rank === "sales" && target.parent_id === session.userId;
  }
  return false;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !canManageAccounts(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const userIds: string[] = Array.isArray(body.user_ids)
      ? Array.from(
          new Set(
            (body.user_ids as unknown[])
              .map((id) => String(id ?? "").trim())
              .filter((id) => id.length > 0)
          )
        )
      : [];

    if (!userIds.length) {
      return NextResponse.json({ ok: false, message: "선택된 계정이 없습니다." }, { status: 400 });
    }
    if (userIds.length > 100) {
      return NextResponse.json({ ok: false, message: "한 번에 100명까지 비활성화할 수 있습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("staff_users")
      .select("id, name, rank, parent_id, is_active")
      .in("id", userIds);

    if (error) {
      console.error("bulk-deactivate load:", error);
      return NextResponse.json({ ok: false, message: "계정을 불러오지 못했습니다." }, { status: 500 });
    }

    const byId = new Map<string, StaffRow>();
    for (const row of rows ?? []) {
      const staff = row as StaffRow;
      byId.set(String(staff.id), staff);
    }
    const allowed: StaffRow[] = [];
    const skipped: string[] = [];

    for (const id of userIds) {
      const target = byId.get(id);
      if (!target) {
        skipped.push(id);
        continue;
      }
      if (!canDeactivateTarget(session, target)) {
        skipped.push(id);
        continue;
      }
      allowed.push(target);
    }

    if (!allowed.length) {
      return NextResponse.json({
        ok: false,
        message: "비활성화할 수 있는 계정이 없습니다. 본인·관리자·권한 밖 계정은 제외됩니다.",
      }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("staff_users")
      .update({ is_active: false })
      .in(
        "id",
        allowed.map((u) => u.id)
      );

    if (updateError) {
      console.error("bulk-deactivate update:", updateError);
      return NextResponse.json({ ok: false, message: "비활성화에 실패했습니다." }, { status: 500 });
    }

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "user.bulk_deactivate",
      resourceType: "user",
      summary: `계정 일괄 비활성화 ${allowed.length}명`,
      detail: {
        deactivated: allowed.map((u) => ({ id: u.id, name: u.name, rank: u.rank })),
        skipped: skipped.length,
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      deactivated: allowed.length,
      skipped: skipped.length,
      names: allowed.map((u) => u.name),
    });
  } catch (e) {
    console.error("POST /api/admin/users/bulk-deactivate:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

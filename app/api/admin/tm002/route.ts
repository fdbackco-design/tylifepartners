import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { listTm002Customers } from "@/lib/crm/tm002/store";
import { canAccessTm002, tm002VisibleAssigneeIdsFromStaff } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

/** GET /api/admin/tm002 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessTm002(session)) {
    return NextResponse.json({ ok: false, message: "접근 권한이 없습니다." }, { status: 403 });
  }

  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(sp.get("limit") || 20), 1), 1000);
    const offset = Math.max(Number(sp.get("offset") || 0), 0);

    const supabase = getSupabaseAdmin();
    const { data: staffRows } = await supabase
      .from("staff_users")
      .select("id, name, parent_id, rank, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    const staffLite = (staffRows ?? []).map((s) => ({
      id: String(s.id),
      parent_id: s.parent_id ? String(s.parent_id) : null,
    }));
    const scoped = tm002VisibleAssigneeIdsFromStaff(session, staffLite);

    const { items, total } = await listTm002Customers({
      q: sp.get("q") || "",
      status: sp.get("status") || "",
      ids: String(sp.get("ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      assigneeId: sp.get("assignee_id") || "",
      unassignedOnly: sp.get("unassigned") === "1",
      assignedDate: sp.get("assigned_date") || "",
      visibleAssigneeIds: scoped,
      limit,
      offset,
      includeHistory: session.rank === "admin" || session.rank === "tm_admin",
    });

    const staffOut =
      scoped === "all"
        ? staffRows ?? []
        : (staffRows ?? []).filter((s) => scoped.includes(String(s.id)));

    return NextResponse.json({
      ok: true,
      items,
      total,
      limit,
      offset,
      staff: staffOut.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        parent_id: s.parent_id ? String(s.parent_id) : null,
        rank: String(s.rank),
      })),
      session: { rank: session.rank, userId: session.userId, name: session.name },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/tm002_|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          message: "TM002 테이블이 없습니다. Supabase에서 supabase/migrations/060_tm002.sql 을 실행해 주세요.",
        },
        { status: 503 }
      );
    }
    console.error("GET /api/admin/tm002:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { listTm001Customers } from "@/lib/crm/tm001/store";
import { visibleAssigneeIdsFromStaff } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

function canAccessTm001(rank: string | undefined): boolean {
  return rank === "admin" || rank === "manager" || rank === "sales";
}

/** GET /api/admin/tm001 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessTm001(session.rank)) {
    return NextResponse.json({ ok: false, message: "접근 권한이 없습니다." }, { status: 403 });
  }

  try {
    const sp = request.nextUrl.searchParams;
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
    const scoped = visibleAssigneeIdsFromStaff(session, staffLite);

    const { items, regions } = await listTm001Customers({
      q: sp.get("q") || "",
      region: sp.get("region") || "",
      status: sp.get("status") || "",
      visibleAssigneeIds: scoped,
    });

    // sales는 본인만 담당자 목록에, manager/admin은 전체
    const staffOut =
      session.rank === "sales"
        ? (staffRows ?? []).filter((s) => String(s.id) === session.userId)
        : staffRows ?? [];

    const stayTotal = items.reduce((n, c) => n + c.stays.length, 0);

    return NextResponse.json({
      ok: true,
      items,
      regions,
      staff: staffOut.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        parent_id: s.parent_id ? String(s.parent_id) : null,
        rank: String(s.rank),
      })),
      session: { rank: session.rank, userId: session.userId, name: session.name },
      summary: { customers: items.length, stays: stayTotal },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/tm001_|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          message: "TM001 테이블이 없습니다. Supabase에서 supabase/migrations/045_tm001_affiliate.sql 을 실행해 주세요.",
        },
        { status: 503 }
      );
    }
    console.error("GET /api/admin/tm001:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

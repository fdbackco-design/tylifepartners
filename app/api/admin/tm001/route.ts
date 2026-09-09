import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { listTm001Customers } from "@/lib/crm/tm001/store";
import { getSupabaseAdmin } from "@/lib/supabase";

function requireAdminSession() {
  return getSession();
}

/** GET /api/admin/tm001 */
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  try {
    const sp = request.nextUrl.searchParams;
    const { items, regions } = await listTm001Customers({
      q: sp.get("q") || "",
      region: sp.get("region") || "",
      status: sp.get("status") || "",
    });

    const supabase = getSupabaseAdmin();
    const { data: staff } = await supabase
      .from("staff_users")
      .select("id, name, parent_id, rank, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    const stayTotal = items.reduce((n, c) => n + c.stays.length, 0);

    return NextResponse.json({
      ok: true,
      items,
      regions,
      staff: (staff ?? []).map((s) => ({
        id: String(s.id),
        name: String(s.name),
        parent_id: s.parent_id ? String(s.parent_id) : null,
        rank: String(s.rank),
      })),
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

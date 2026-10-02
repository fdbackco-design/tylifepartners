import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

/** GET /api/admin/admin-read/request-logs?key_id=&limit= */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") || 100), 1), 500);
  const keyId = sp.get("key_id")?.trim();

  try {
    const supabase = getSupabaseAdmin();
    let qb = supabase
      .from("admin_read_api_request_logs")
      .select(
        "id, key_id, method, path, status_code, duration_ms, ip, query_summary, error_code, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (keyId) qb = qb.eq("key_id", keyId);

    const { data, error } = await qb;
    if (error) {
      const msg = /admin_read_api_|schema cache|does not exist/i.test(error.message)
        ? "관리자 읽기 API 테이블이 없습니다. supabase/migrations/063_admin_read_api.sql 을 실행해 주세요."
        : error.message;
      return NextResponse.json({ ok: false, message: msg }, { status: 500 });
    }
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    console.error("GET /api/admin/admin-read/request-logs:", e);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

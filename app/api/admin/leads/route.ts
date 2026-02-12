import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/admin/leads
 * 관리자 인증 후 리드 목록 조회 (search, limit, offset)
 * [환경변수] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SESSION_SECRET
 */
export async function GET(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json(
      { ok: false, message: "인증이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("leads")
      .select("id, name, phone, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      const safe = search.replace(/,/g, "");
      const term = `%${safe}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term}`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Supabase leads fetch error:", error);
      return NextResponse.json(
        { ok: false, message: "조회 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    // created_at을 KST 문자열로 변환
    const items = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      created_at: row.created_at
        ? new Date(row.created_at).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "",
    }));

    return NextResponse.json({ ok: true, items, total: count ?? items.length });
  } catch (e) {
    console.error("GET /api/admin/leads error:", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

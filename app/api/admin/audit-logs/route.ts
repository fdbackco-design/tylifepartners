import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/admin/audit-logs?limit=50&offset=0&action=&actor=&q=
 * 관리자만 조회
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") || 50)));
  const offset = Math.max(0, Number(sp.get("offset") || 0));
  const action = String(sp.get("action") ?? "").trim();
  const actor = String(sp.get("actor") ?? "").trim();
  const q = String(sp.get("q") ?? "").trim();

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("admin_audit_logs")
    .select(
      "id, created_at, actor_user_id, actor_login_id, actor_name, actor_rank, action, resource_type, resource_id, summary, detail, ip, success",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (action) query = query.eq("action", action);
  if (actor) {
    query = query.or(
      `actor_login_id.ilike.%${actor}%,actor_name.ilike.%${actor}%`
    );
  }
  if (q) {
    query = query.or(`summary.ilike.%${q}%,resource_id.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("GET audit-logs:", error);
    const msg = /admin_audit_logs|schema cache/i.test(error.message)
      ? "감사 로그 테이블이 없습니다. 마이그레이션 029를 적용해 주세요."
      : "감사 로그를 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}

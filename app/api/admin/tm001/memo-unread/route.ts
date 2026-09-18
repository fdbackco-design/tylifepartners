import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { canAccessTm001, canEditAdminComment, tm001VisibleAssigneeIds } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * TM001 목록 행의 memo_admin_unread만 가볍게 조회 (관리자·매니저용 폴링).
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessTm001(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  if (!canEditAdminComment(session)) {
    return NextResponse.json({ ok: true, unread: {} as Record<string, boolean> });
  }

  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, unread: {} as Record<string, boolean> });
  }

  try {
    const supabase = getSupabaseAdmin();
    const scoped = await tm001VisibleAssigneeIds(session);
    let q = supabase
      .from("tm001_customers")
      .select("id, memo_admin_unread, assignee_id")
      .in("id", ids);
    if (scoped !== "all") {
      q = q.in("assignee_id", scoped.length ? scoped : ["__none__"]);
    }
    const { data, error } = await q;
    if (error) {
      if (/memo_admin_unread|schema cache|column/i.test(error.message)) {
        return NextResponse.json({ ok: true, unread: {} as Record<string, boolean> });
      }
      throw error;
    }
    const unread: Record<string, boolean> = {};
    for (const row of data ?? []) {
      unread[String(row.id)] = Boolean(row.memo_admin_unread);
    }
    return NextResponse.json({ ok: true, unread });
  } catch (e) {
    console.error("GET /api/admin/tm001/memo-unread:", e);
    return NextResponse.json({ ok: false, message: "조회에 실패했습니다." }, { status: 500 });
  }
}

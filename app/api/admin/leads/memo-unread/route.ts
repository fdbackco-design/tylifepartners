import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { canAccessCrmLeads, canEditAdminComment, visibleAssigneeIds } from "@/lib/crm/scope";
import { tableForCategory } from "@/lib/crm/status";
import type { LeadCategory } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * 현재 목록 행의 memo_admin_unread만 가볍게 조회 (관리자·매니저용 폴링).
 * 전체 목록 재조회 없이 빨간 점만 동기화한다.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canAccessCrmLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  if (!canEditAdminComment(session)) {
    return NextResponse.json({ ok: true, unread: {} as Record<string, boolean> });
  }

  const sp = request.nextUrl.searchParams;
  const ids = (sp.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, unread: {} as Record<string, boolean> });
  }

  const catRaw = sp.get("category");
  const category: LeadCategory | "all" =
    catRaw === "candidates" || catRaw === "b2b"
      ? "candidates"
      : catRaw === "all"
        ? "all"
        : "consumers";

  const supabase = getSupabaseAdmin();
  const scoped = await visibleAssigneeIds(session);
  const unread: Record<string, boolean> = {};

  const fetchTable = async (table: "leads" | "tylife_b2b") => {
    let q = supabase.from(table).select("id, memo_admin_unread, assignee_id").in("id", ids);
    if (scoped !== "all") {
      q = q.in("assignee_id", scoped.length ? scoped : ["__none__"]);
    }
    const { data, error } = await q;
    if (error) {
      if (/memo_admin_unread|schema cache|column/i.test(error.message)) return;
      throw error;
    }
    for (const row of data ?? []) {
      unread[String(row.id)] = Boolean(row.memo_admin_unread);
    }
  };

  try {
    if (category === "all") {
      await Promise.all([fetchTable("leads"), fetchTable("tylife_b2b")]);
    } else {
      await fetchTable(tableForCategory(category));
    }
    return NextResponse.json({ ok: true, unread });
  } catch (e) {
    console.error("GET /api/admin/leads/memo-unread:", e);
    return NextResponse.json({ ok: false, message: "조회에 실패했습니다." }, { status: 500 });
  }
}

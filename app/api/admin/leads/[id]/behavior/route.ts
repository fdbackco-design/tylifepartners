import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { loadLeadBehavior } from "@/lib/landing-analytics/leadBehavior";
import { visibleAssigneeIds } from "@/lib/crm/scope";
import { tableForCategory } from "@/lib/crm/status";
import type { LeadCategory } from "@/lib/crm/types";
import { getSupabaseAdmin } from "@/lib/supabase";

function categoryOf(request: NextRequest): LeadCategory {
  const cat = request.nextUrl.searchParams.get("category");
  return cat === "candidates" || cat === "b2b" ? "candidates" : "consumers";
}

/**
 * GET /api/admin/leads/[id]/behavior?category=consumers|candidates
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const category = categoryOf(request);
  const table = tableForCategory(category);
  const supabase = getSupabaseAdmin();

  const { data: lead, error } = await supabase
    .from(table)
    .select("id, assignee_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !lead) {
    return NextResponse.json({ ok: false, message: "리드를 찾을 수 없습니다." }, { status: 404 });
  }

  const scoped = await visibleAssigneeIds(session);
  const assigneeId = (lead as { assignee_id?: string | null }).assignee_id ?? null;
  if (scoped !== "all" && (!assigneeId || !scoped.includes(assigneeId))) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const report = await loadLeadBehavior(table, id);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    console.error("GET lead behavior:", e);
    return NextResponse.json({ ok: false, message: "행동 분석 조회 실패" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { CANDIDATE_SELECT, CONSUMER_SELECT } from "@/lib/crm/mapLead";
import { canEditAdminComment, visibleAssigneeIds } from "@/lib/crm/scope";
import { tableForCategory } from "@/lib/crm/status";
import type { LeadCategory } from "@/lib/crm/types";
import { notifyAssigneeAdminComment } from "@/lib/webPush";
import { getSupabaseAdmin } from "@/lib/supabase";

function categoryOf(request: NextRequest): LeadCategory {
  const cat = request.nextUrl.searchParams.get("category");
  return cat === "candidates" || cat === "b2b" ? "candidates" : "consumers";
}

/**
 * POST /api/admin/leads/[id]/notify-comment?category=consumers|candidates
 * 코멘트 작성 후 창을 닫을 때 담당자에게 1회 알림
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (!canEditAdminComment(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  const category = categoryOf(request);
  const table = tableForCategory(category);
  const supabase = getSupabaseAdmin();
  const select = category === "candidates" ? CANDIDATE_SELECT : CONSUMER_SELECT;

  const { data, error } = await (supabase.from(table) as any).select(select).eq("id", id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ ok: false, message: "리드를 찾을 수 없습니다." }, { status: 404 });
  }

  const scoped = await visibleAssigneeIds(session);
  const assigneeId = (data as { assignee_id?: string | null }).assignee_id ?? null;
  if (scoped !== "all" && (!assigneeId || !scoped.includes(assigneeId))) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  if (!assigneeId) {
    return NextResponse.json({ ok: false, message: "담당자가 없어 알림을 보낼 수 없습니다." }, { status: 400 });
  }

  if (session.userId && session.userId === assigneeId) {
    return NextResponse.json({ ok: true, skipped: true, message: "본인 담당 건은 알림을 보내지 않습니다." });
  }

  const name = String((data as { name?: string }).name ?? "");
  const phone = String((data as { phone?: string }).phone ?? "");

  await notifyAssigneeAdminComment({
    assigneeId,
    kind: category,
    name,
    phone,
    leadId: id,
    authorName: session.name,
  });

  return NextResponse.json({ ok: true, message: "담당자에게 알림을 보냈습니다." });
}

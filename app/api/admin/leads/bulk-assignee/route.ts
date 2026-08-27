import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { changeLeadAssignee } from "@/lib/crm/assignLead";
import type { LeadCategory } from "@/lib/crm/types";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (session.rank === "sales") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const assigneeId = body.assignee_id == null || body.assignee_id === "" ? null : String(body.assignee_id);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ ok: false, message: "선택된 항목이 없습니다." }, { status: 400 });
    }
    if (items.length > 200) {
      return NextResponse.json({ ok: false, message: "한 번에 200건까지 변경할 수 있습니다." }, { status: 400 });
    }

    let updated = 0;
    const errors: string[] = [];
    for (const raw of items) {
      const id = String(raw?.id ?? "");
      const category: LeadCategory =
        raw?.category === "candidates" || raw?.type === "후보자" ? "candidates" : "consumers";
      if (!id) continue;
      const result = await changeLeadAssignee({ session, id, category, assigneeId });
      if (result.ok) updated += 1;
      else errors.push(`${id}: ${result.message}`);
    }

    if (!updated && errors.length) {
      return NextResponse.json({ ok: false, message: errors[0] || "변경에 실패했습니다." }, { status: 400 });
    }

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "lead.bulk_assignee",
      resourceType: "lead",
      summary: `담당자 일괄 변경 ${updated}건`,
      detail: { assignee_id: assigneeId, updated, failed: errors.length, item_count: items.length },
      request,
    });

    return NextResponse.json({ ok: true, updated, failed: errors.length });
  } catch (e) {
    console.error("bulk-assignee:", e);
    return NextResponse.json({ ok: false, message: "일괄 변경 중 오류가 발생했습니다." }, { status: 500 });
  }
}

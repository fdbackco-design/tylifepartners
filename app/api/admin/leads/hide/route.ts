import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { hideLeadsFromList, type HideLeadItem } from "@/lib/crm/leadListHide";
import type { LeadCategory } from "@/lib/crm/types";

/**
 * POST /api/admin/leads/hide
 * 선택 리드를 DB 목록에서만 숨김 (실제 삭제 아님)
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items: HideLeadItem[] = [];
    for (const raw of rawItems) {
      const id = String(raw?.id ?? "").trim();
      if (!id) continue;
      const category: LeadCategory =
        raw?.category === "candidates" || raw?.type === "후보자" ? "candidates" : "consumers";
      items.push({ id, category });
    }

    const result = await hideLeadsFromList(session, items);
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }

    const names = result.hiddenDetails.map((d) => d.name).filter(Boolean);
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "lead.hide_from_list",
      resourceType: "lead",
      summary: `목록에서 ${result.hidden}건 숨김${result.skipped ? ` (${result.skipped}건 제외)` : ""}`,
      detail: {
        hidden_count: result.hidden,
        skipped_count: result.skipped,
        items: result.hiddenDetails,
        names_preview: names.slice(0, 20),
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      hidden: result.hidden,
      skipped: result.skipped,
      message:
        result.skipped > 0
          ? `${result.hidden}건을 목록에서 숨겼습니다. (${result.skipped}건은 권한·상태 때문에 제외)`
          : `${result.hidden}건을 목록에서 숨겼습니다.`,
    });
  } catch (e) {
    console.error("POST /api/admin/leads/hide:", e);
    return NextResponse.json({ ok: false, message: "숨김 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

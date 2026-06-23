import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { assignHqManagerAndSync } from "@/lib/hqManagerSync/assign";

/**
 * POST /api/admin/hq-manager/assign
 * 본사 시트1 G열 담당자 저장 후 Apps Script 동기화
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await assignHqManagerAndSync({
      newManagerName: String(body.newManagerName ?? body.managerName ?? ""),
      customerName: String(body.customerName ?? body.name ?? ""),
      phone: String(body.phone ?? ""),
      rowNumber:
        body.rowNumber != null ? parseInt(String(body.rowNumber), 10) : undefined,
      eventId: body.eventId != null ? String(body.eventId) : undefined,
    });

    if (!result.ok && !result.assignmentComplete) {
      return NextResponse.json(
        {
          ok: false,
          message: result.message ?? "담당자 배정에 실패했습니다.",
          eventId: result.eventId,
          assignmentComplete: false,
          syncComplete: false,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      eventId: result.eventId,
      assignmentComplete: result.assignmentComplete,
      syncComplete: result.syncComplete,
      rowNumber: result.rowNumber,
      syncError: result.syncError,
      message: result.message,
      cached: result.cached ?? false,
    });
  } catch (e) {
    console.error("POST /api/admin/hq-manager/assign error:", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { retryHqManagerSync } from "@/lib/hqManagerSync/assign";

/**
 * POST /api/admin/hq-manager-sync/retry
 * G열 저장은 유지한 채 동기화 API만 재시도
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const eventId = String(body.eventId ?? "").trim();
    if (!eventId) {
      return NextResponse.json({ ok: false, message: "eventId가 필요합니다." }, { status: 400 });
    }

    const result = await retryHqManagerSync(eventId);

    return NextResponse.json({
      ok: result.ok,
      eventId: result.eventId,
      assignmentComplete: result.assignmentComplete,
      syncComplete: result.syncComplete,
      rowNumber: result.rowNumber,
      syncError: result.syncError,
      message: result.message,
      cached: result.cached ?? false,
    });
  } catch (e) {
    console.error("POST /api/admin/hq-manager-sync/retry error:", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

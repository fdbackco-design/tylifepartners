import { NextResponse } from "next/server";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/webPush";

/**
 * GET /api/admin/push/vapid-public
 * VAPID 공개키는 클라이언트 구독용으로 공개되어도 됩니다(비밀키는 서버만 보유).
 */
export async function GET() {
  if (!isWebPushConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "웹 푸시가 설정되지 않았습니다. VAPID 환경변수를 확인해 주세요.",
    });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    publicKey: getVapidPublicKey(),
  });
}

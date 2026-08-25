import { NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/webPush";

/** GET /api/admin/push/vapid-public */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json({ ok: false, configured: false, message: "웹 푸시가 설정되지 않았습니다." });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    publicKey: getVapidPublicKey(),
  });
}

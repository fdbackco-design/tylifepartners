import { NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";

/** GET /api/admin/me — 미로그인 시에도 200 + ok:false (콘솔 401 노이즈 방지) */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." });
  }
  return NextResponse.json({
    ok: true,
    user: {
      rank: session.rank,
      userId: session.userId,
      name: session.name,
      loginId: session.loginId,
      region: session.region,
      parentId: session.parentId,
    },
  });
}

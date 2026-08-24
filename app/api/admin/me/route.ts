import { NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
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

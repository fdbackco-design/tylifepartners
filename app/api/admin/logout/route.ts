import { NextRequest, NextResponse } from "next/server";
import { getCookieConfig, getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";

/**
 * POST /api/admin/logout
 * 쿠키 만료 처리
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session) {
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "logout",
      resourceType: "session",
      summary: `${session.name || session.loginId} 로그아웃`,
      request,
    });
  }

  const config = getCookieConfig("");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(config.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

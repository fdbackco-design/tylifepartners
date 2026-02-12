import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, getCookieConfig } from "@/lib/adminSession";

/**
 * POST /api/admin/login
 * 관리자 로그인 - 서버에서 ID/PW 검증 후 HttpOnly 쿠키 발급
 * [환경변수] ADMIN_ID, ADMIN_PASSWORD, ADMIN_SESSION_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const password = String(body.password ?? "");

    const adminId = process.env.ADMIN_ID;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminId || !adminPassword) {
      console.error("ADMIN_ID or ADMIN_PASSWORD not set");
      return NextResponse.json(
        { ok: false, message: "서버 설정 오류" },
        { status: 500 }
      );
    }

    if (id !== adminId || password !== adminPassword) {
      return NextResponse.json(
        { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const token = await createAdminSession();
    const config = getCookieConfig(token);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(config.name, config.value, {
      httpOnly: config.httpOnly,
      secure: config.secure,
      sameSite: config.sameSite,
      path: config.path,
      maxAge: config.maxAge,
    });

    return response;
  } catch (e) {
    console.error("POST /api/admin/login error:", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

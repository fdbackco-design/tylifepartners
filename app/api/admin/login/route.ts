import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, createSession, getCookieConfig } from "@/lib/adminSession";
import { writeAdminAudit } from "@/lib/crm/adminAudit";
import { credentialsFromPhone, verifyPassword } from "@/lib/crm/password";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const password = String(body.password ?? "");

    const adminId = process.env.ADMIN_ID;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminId || !adminPassword) {
      return NextResponse.json({ ok: false, message: "서버 설정 오류입니다." }, { status: 500 });
    }

    let token: string;
    let actor = {
      userId: null as string | null,
      loginId: id,
      name: "관리자",
      rank: "admin",
    };

    if (id === adminId && password === adminPassword) {
      token = await createAdminSession();
      actor = { userId: null, loginId: adminId, name: "관리자", rank: "admin" };
    } else {
      const supabase = getSupabaseAdmin();
      const { data: user, error } = await supabase
        .from("staff_users")
        .select("id, name, phone, region, rank, login_id, password_hash, parent_id, is_active")
        .or(`login_id.eq.${id},phone.eq.${id}`)
        .maybeSingle();
      if (error) {
        console.error("staff login query:", error);
        return NextResponse.json({ ok: false, message: "로그인 처리 중 오류가 발생했습니다." }, { status: 500 });
      }
      if (!user || !user.is_active) {
        void writeAdminAudit({
          actor: { userId: null, loginId: id, name: "", rank: "" },
          action: "login_failed",
          resourceType: "session",
          summary: `로그인 실패 (${id})`,
          request,
          success: false,
        });
        return NextResponse.json({ ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      const ok = verifyPassword(password, user.password_hash) || password === credentialsFromPhone(user.phone);
      if (!ok) {
        void writeAdminAudit({
          actor: {
            userId: user.id,
            loginId: user.login_id,
            name: user.name,
            rank: user.rank,
          },
          action: "login_failed",
          resourceType: "session",
          summary: `로그인 실패 (${user.login_id})`,
          request,
          success: false,
        });
        return NextResponse.json({ ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      const rank =
        user.rank === "admin" ? "admin" : user.rank === "manager" ? "manager" : "sales";
      token = await createSession({
        rank,
        userId: user.id,
        name: user.name,
        loginId: user.login_id,
        region: user.region,
        parentId: user.parent_id,
      });
      actor = {
        userId: user.id,
        loginId: user.login_id,
        name: user.name,
        rank,
      };
    }

    void writeAdminAudit({
      actor,
      action: "login",
      resourceType: "session",
      summary: `${actor.name || actor.loginId} 로그인`,
      detail: { login_id: actor.loginId, rank: actor.rank },
      request,
    });

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
    console.error("POST /api/admin/login:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

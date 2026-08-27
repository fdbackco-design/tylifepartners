import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { credentialsFromPhone, hashPassword, verifyPassword } from "@/lib/crm/password";
import { getSupabaseAdmin } from "@/lib/supabase";

const MIN_LEN = 6;

/**
 * POST /api/admin/me/password
 * 로그인 사용자가 본인 비밀번호를 변경합니다. (ENV 관리자 세션 제외)
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (!session.userId) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "환경변수(ADMIN_ID) 관리자 계정은 이 화면에서 비밀번호를 바꿀 수 없습니다. 배포 설정의 ADMIN_PASSWORD를 변경해 주세요.",
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const currentPassword = String(body.current_password ?? "");
    const newPassword = String(body.new_password ?? "");
    const confirmPassword = String(body.confirm_password ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ ok: false, message: "모든 항목을 입력해 주세요." }, { status: 400 });
    }
    if (newPassword.length < MIN_LEN) {
      return NextResponse.json(
        { ok: false, message: `새 비밀번호는 ${MIN_LEN}자 이상이어야 합니다.` },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ ok: false, message: "새 비밀번호 확인이 일치하지 않습니다." }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { ok: false, message: "새 비밀번호는 현재 비밀번호와 달라야 합니다." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("staff_users")
      .select("id, phone, login_id, password_hash, is_active")
      .eq("id", session.userId)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json({ ok: false, message: "계정을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!user.is_active) {
      return NextResponse.json({ ok: false, message: "비활성 계정입니다." }, { status: 403 });
    }

    const phoneCred = credentialsFromPhone(String(user.phone ?? ""));
    const currentOk =
      verifyPassword(currentPassword, String(user.password_hash ?? "")) ||
      currentPassword === phoneCred;
    if (!currentOk) {
      return NextResponse.json({ ok: false, message: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    if (newPassword === phoneCred || newPassword === String(user.login_id ?? "")) {
      return NextResponse.json(
        { ok: false, message: "초기 비밀번호(휴대폰 뒤 8자리)와 동일한 값은 사용할 수 없습니다." },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from("staff_users")
      .update({ password_hash: hashPassword(newPassword), must_change_password: false })
      .eq("id", user.id);

    if (updateErr && /must_change_password|schema cache|column/i.test(updateErr.message)) {
      const retry = await supabase
        .from("staff_users")
        .update({ password_hash: hashPassword(newPassword) })
        .eq("id", user.id);
      if (retry.error) {
        console.error("POST /api/admin/me/password:", retry.error);
        return NextResponse.json({ ok: false, message: "비밀번호 변경에 실패했습니다." }, { status: 500 });
      }
    } else if (updateErr) {
      console.error("POST /api/admin/me/password:", updateErr);
      return NextResponse.json({ ok: false, message: "비밀번호 변경에 실패했습니다." }, { status: 500 });
    }

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "user.change_password",
      resourceType: "user",
      resourceId: user.id,
      summary: `${session.name || session.loginId} 비밀번호 변경`,
      request,
    });

    return NextResponse.json({ ok: true, message: "비밀번호가 변경되었습니다." });
  } catch (e) {
    console.error("POST /api/admin/me/password:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

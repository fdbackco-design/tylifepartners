import { NextRequest, NextResponse } from "next/server";
import { getSession, requireRank } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/admin/assignment/auto-assign
 * 헤더 토글용 — 규칙/스태프 없이 설정만 조회
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: true, auto_assign_enabled: false });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("crm_settings")
      .select("value")
      .eq("key", "auto_assign_enabled")
      .maybeSingle();
    const auto_assign_enabled = data?.value !== false && data?.value !== "false";
    return NextResponse.json({ ok: true, auto_assign_enabled });
  } catch (e) {
    console.error("GET assignment/auto-assign:", e);
    return NextResponse.json({ ok: false, message: "설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireRank("admin");
  if (!session) {
    return NextResponse.json({ ok: false, message: "관리자만 변경할 수 있습니다." }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (body.auto_assign_enabled == null) {
      return NextResponse.json({ ok: false, message: "auto_assign_enabled가 필요합니다." }, { status: 400 });
    }
    const enabled = Boolean(body.auto_assign_enabled);
    const supabase = getSupabaseAdmin();
    await supabase.from("crm_settings").upsert({
      key: "auto_assign_enabled",
      value: enabled,
      updated_at: new Date().toISOString(),
    });
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "assignment.update",
      resourceType: "assignment",
      summary: `자동분배 ${enabled ? "ON" : "OFF"}`,
      detail: { auto_assign_enabled: enabled },
      request,
    });
    return NextResponse.json({ ok: true, auto_assign_enabled: enabled });
  } catch (e) {
    console.error("PUT assignment/auto-assign:", e);
    return NextResponse.json({ ok: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

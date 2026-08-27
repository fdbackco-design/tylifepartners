import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name != null) patch.name = String(body.name).trim();
  if (body.memo !== undefined) {
    const memo = String(body.memo ?? "").trim();
    patch.memo = memo || null;
  }
  if (body.is_active != null) patch.is_active = Boolean(body.is_active);

  const { data, error } = await supabase
    .from("lead_blacklist")
    .update(patch)
    .eq("id", id)
    .select("id, name, phone, normalized_phone, memo, is_active, created_by_name, created_at, updated_at")
    .maybeSingle();
  if (error) {
    console.error("PATCH lead_blacklist:", error);
    return NextResponse.json({ ok: false, message: "수정에 실패했습니다." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, message: "항목을 찾을 수 없습니다." }, { status: 404 });

  void writeAdminAudit({
    actor: actorFromSession(session),
    action: "blacklist.update",
    resourceType: "blacklist",
    resourceId: id,
    summary: `블랙리스트 수정: ${data.name}`,
    detail: { patch },
    request,
  });

  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  // 하드 삭제 대신 비활성화 (이력 유지)
  const { data, error } = await supabase
    .from("lead_blacklist")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();
  if (error) {
    console.error("DELETE lead_blacklist:", error);
    return NextResponse.json({ ok: false, message: "삭제에 실패했습니다." }, { status: 500 });
  }

  void writeAdminAudit({
    actor: actorFromSession(session),
    action: "blacklist.deactivate",
    resourceType: "blacklist",
    resourceId: id,
    summary: `블랙리스트 비활성화: ${data?.name || id}`,
    request,
  });

  return NextResponse.json({ ok: true });
}

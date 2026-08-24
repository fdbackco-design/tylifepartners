import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { credentialsFromPhone, hashPassword } from "@/lib/crm/password";
import { canManageAccounts } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageAccounts(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from("staff_users").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ ok: false, message: "계정을 찾을 수 없습니다." }, { status: 404 });

  if (session.rank === "manager" && existing.parent_id !== session.userId && existing.id !== session.userId) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.region != null) patch.region = String(body.region).trim() || null;
  if (body.is_active != null) patch.is_active = Boolean(body.is_active);
  if (body.parent_id !== undefined && session.rank === "admin") {
    patch.parent_id = body.parent_id ? String(body.parent_id) : null;
  }
  if (body.reset_password) {
    patch.password_hash = hashPassword(credentialsFromPhone(existing.phone));
  }

  const { error } = await supabase.from("staff_users").update(patch).eq("id", id);
  if (error) {
    console.error("PATCH staff_users:", error);
    return NextResponse.json({ ok: false, message: "수정에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

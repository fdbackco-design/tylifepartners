import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { credentialsFromPhone, hashPassword } from "@/lib/crm/password";
import { isRegionZoneName } from "@/lib/crm/regionZones";
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
  if (body.region !== undefined) {
    const regionRaw = String(body.region ?? "").trim() || null;
    if (regionRaw && !isRegionZoneName(regionRaw)) {
      return NextResponse.json({ ok: false, message: "담당 권역을 목록에서 선택해 주세요." }, { status: 400 });
    }
    patch.region = regionRaw;
  }
  if (body.is_active != null) patch.is_active = Boolean(body.is_active);

  let nextRank = String(existing.rank);
  if (body.rank != null) {
    if (session.rank !== "admin") {
      return NextResponse.json({ ok: false, message: "직급 변경은 관리자만 가능합니다." }, { status: 403 });
    }
    const rank = String(body.rank).trim();
    if (rank !== "admin" && rank !== "manager" && rank !== "sales") {
      return NextResponse.json(
        { ok: false, message: "직급은 관리자·매니저·영업자만 가능합니다." },
        { status: 400 }
      );
    }
    nextRank = rank;
    patch.rank = rank;
  }

  if (body.parent_id !== undefined && session.rank === "admin") {
    patch.parent_id = body.parent_id ? String(body.parent_id) : null;
  }

  // 직급 전환 시 소속 관계 정리
  if (nextRank === "manager" || nextRank === "admin") {
    patch.parent_id = null;
  } else if (nextRank === "sales" && body.parent_id !== undefined && session.rank === "admin") {
    const parentId = body.parent_id ? String(body.parent_id) : null;
    if (parentId === id) {
      return NextResponse.json({ ok: false, message: "본인을 소속 매니저로 지정할 수 없습니다." }, { status: 400 });
    }
    if (parentId) {
      const { data: parent } = await supabase
        .from("staff_users")
        .select("id, rank, is_active")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent || parent.rank !== "manager" || !parent.is_active) {
        return NextResponse.json({ ok: false, message: "활성 매니저만 소속으로 지정할 수 있습니다." }, { status: 400 });
      }
    }
    patch.parent_id = parentId;
  }

  if (body.reset_password) {
    patch.password_hash = hashPassword(credentialsFromPhone(existing.phone));
  }

  const { error } = await supabase.from("staff_users").update(patch).eq("id", id);
  if (error) {
    console.error("PATCH staff_users:", error);
    return NextResponse.json({ ok: false, message: "수정에 실패했습니다." }, { status: 500 });
  }

  // 매니저에서 다른 직급으로 바꾸면 기존 산하의 parent_id 해제
  if (existing.rank === "manager" && nextRank !== "manager") {
    const { error: clearErr } = await supabase
      .from("staff_users")
      .update({ parent_id: null })
      .eq("parent_id", id);
    if (clearErr) {
      console.error("PATCH clear subordinates parent_id:", clearErr);
      return NextResponse.json(
        { ok: false, message: "직급은 변경됐지만 산하 소속 정리에 실패했습니다. 산하 계정을 확인해 주세요." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

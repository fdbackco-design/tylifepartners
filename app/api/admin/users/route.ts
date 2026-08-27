import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { credentialsFromPhone, hashPassword, verifyPassword } from "@/lib/crm/password";
import { isRegionZoneName } from "@/lib/crm/regionZones";
import { canManageAccounts } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("staff_users")
    .select("id, name, phone, region, rank, login_id, parent_id, is_active, created_at, password_hash")
    .order("created_at", { ascending: false });

  if (session.rank === "sales") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  if (session.rank === "manager" && session.userId) {
    query = query.or(`id.eq.${session.userId},parent_id.eq.${session.userId}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET staff_users:", error);
    return NextResponse.json({ ok: false, message: "계정 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const byId = new Map((data ?? []).map((u) => [u.id, u.name]));
  const { data: parents } = await supabase.from("staff_users").select("id, name").eq("rank", "manager");
  for (const p of parents ?? []) byId.set(p.id, p.name);

  const items = (data ?? []).map((u) => {
    const { password_hash, ...rest } = u as typeof u & { password_hash?: string };
    let account_status: "active" | "invite_pending" | "inactive" = "active";
    if (!rest.is_active) account_status = "inactive";
    else if (password_hash && verifyPassword(credentialsFromPhone(String(rest.phone ?? "")), password_hash)) {
      account_status = "invite_pending";
    }
    return {
      ...rest,
      parent_name: rest.parent_id ? byId.get(rest.parent_id) ?? null : null,
      account_status,
      last_login_at: null as string | null,
    };
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !canManageAccounts(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const regionRaw = String(body.region ?? "").trim() || null;
    if (regionRaw && !isRegionZoneName(regionRaw)) {
      return NextResponse.json({ ok: false, message: "담당 권역을 목록에서 선택해 주세요." }, { status: 400 });
    }
    const region = regionRaw;
    let rank = String(body.rank ?? "").trim();
    let parentId = body.parent_id ? String(body.parent_id) : null;

    if (!name || phone.length < 10) {
      return NextResponse.json({ ok: false, message: "이름과 휴대폰번호를 확인해주세요." }, { status: 400 });
    }

    if (session.rank === "manager") {
      rank = "sales";
      parentId = session.userId;
    } else if (session.rank === "admin") {
      if (rank !== "admin" && rank !== "manager" && rank !== "sales") {
        return NextResponse.json(
          { ok: false, message: "직급은 관리자·매니저·영업자만 가능합니다." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
    }
    if (rank === "manager" || rank === "admin") parentId = null;

    const loginId = credentialsFromPhone(phone);
    if (loginId.length < 8) {
      return NextResponse.json({ ok: false, message: "휴대폰번호 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("staff_users")
      .insert({
        name,
        phone,
        region,
        rank,
        login_id: loginId,
        password_hash: hashPassword(loginId),
        parent_id: parentId,
        is_active: true,
      })
      .select("id, name, phone, region, rank, login_id, parent_id, is_active, created_at")
      .single();

    if (error) {
      if (String(error.message).includes("duplicate") || error.code === "23505") {
        return NextResponse.json({ ok: false, message: "이미 등록된 휴대폰번호 또는 아이디입니다." }, { status: 409 });
      }
      console.error("POST staff_users:", error);
      return NextResponse.json({ ok: false, message: "계정 생성에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      item: data,
      initial_password: loginId,
      message: `초기 아이디/비밀번호는 ${loginId} 입니다.`,
    });
  } catch (e) {
    console.error("POST /api/admin/users:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, loadLastLoginAtByStaffIds, writeAdminAudit } from "@/lib/crm/adminAudit";
import { credentialsFromPhone, hashPassword } from "@/lib/crm/password";
import { isRegionZoneName } from "@/lib/crm/regionZones";
import { loadAssignedLeadCountsByStaff } from "@/lib/crm/staffLeadCounts";
import { canManageAccounts } from "@/lib/crm/scope";
import { getSupabaseAdmin } from "@/lib/supabase";

type StaffListRow = {
  id: string;
  name: string;
  phone: string;
  region: string | null;
  rank: string;
  login_id: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  must_change_password?: boolean;
  last_login_at?: string | null;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });

  if (session.rank === "sales") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const selectWithLogin =
    "id, name, phone, region, rank, login_id, parent_id, is_active, created_at, must_change_password, last_login_at";
  const selectWithFlag =
    "id, name, phone, region, rank, login_id, parent_id, is_active, created_at, must_change_password";
  const selectLegacy =
    "id, name, phone, region, rank, login_id, parent_id, is_active, created_at";

  const runList = async (select: string) => {
    let q = supabase.from("staff_users").select(select).order("created_at", { ascending: false });
    if (session.rank === "manager" && session.userId) {
      q = q.or(`id.eq.${session.userId},parent_id.eq.${session.userId}`);
    }
    return q;
  };

  let data: StaffListRow[] = [];
  let { data: raw, error } = await runList(selectWithLogin);
  if (error && /last_login_at|schema cache|column/i.test(error.message)) {
    const fallback = await runList(selectWithFlag);
    raw = fallback.data;
    error = fallback.error;
  }
  if (error && /must_change_password|schema cache|column/i.test(error.message)) {
    const fallback = await runList(selectLegacy);
    raw = fallback.data;
    error = fallback.error;
  }
  if (error) {
    console.error("GET staff_users:", error);
    return NextResponse.json({ ok: false, message: "계정 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  data = ((raw ?? []) as unknown as StaffListRow[]).map((u) => ({
    ...u,
    must_change_password: Boolean(u.must_change_password),
  }));

  const byId = new Map(data.map((u) => [u.id, u.name]));
  for (const u of data) {
    if (u.rank === "manager") byId.set(u.id, u.name);
  }

  const auditLastLogins = await loadLastLoginAtByStaffIds(
    data.filter((u) => !u.last_login_at).map((u) => u.id)
  );

  const leadCounts = await loadAssignedLeadCountsByStaff();

  const items = data.map((u) => {
    let account_status: "active" | "invite_pending" | "inactive" = "active";
    if (!u.is_active) account_status = "inactive";
    else if (u.must_change_password) account_status = "invite_pending";
    const lastLoginAt = u.last_login_at ?? auditLastLogins.get(u.id) ?? null;
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      region: u.region,
      rank: u.rank,
      login_id: u.login_id,
      parent_id: u.parent_id,
      is_active: u.is_active,
      created_at: u.created_at,
      parent_name: u.parent_id ? byId.get(u.parent_id) ?? null : null,
      account_status,
      last_login_at: lastLoginAt,
      assigned_lead_count: leadCounts.get(u.id) ?? 0,
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
    const baseRow = {
      name,
      phone,
      region,
      rank,
      login_id: loginId,
      password_hash: hashPassword(loginId),
      parent_id: parentId,
      is_active: true,
    };
    let { data, error } = await supabase
      .from("staff_users")
      .insert({ ...baseRow, must_change_password: true })
      .select("id, name, phone, region, rank, login_id, parent_id, is_active, created_at")
      .single();

    if (error && /must_change_password|schema cache|column/i.test(error.message)) {
      const fallback = await supabase
        .from("staff_users")
        .insert(baseRow)
        .select("id, name, phone, region, rank, login_id, parent_id, is_active, created_at")
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (String(error.message).includes("duplicate") || error.code === "23505") {
        return NextResponse.json({ ok: false, message: "이미 등록된 휴대폰번호 또는 아이디입니다." }, { status: 409 });
      }
      console.error("POST staff_users:", error);
      return NextResponse.json({ ok: false, message: "계정 생성에 실패했습니다." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, message: "계정 생성에 실패했습니다." }, { status: 500 });
    }

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "user.create",
      resourceType: "user",
      resourceId: data.id,
      summary: `계정 생성: ${data.name} (${data.rank})`,
      detail: { name: data.name, rank: data.rank, login_id: data.login_id, region: data.region },
      request,
    });

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

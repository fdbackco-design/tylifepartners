import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { formatPhoneKorean } from "@/lib/phone";
import { normalizePhoneDigits } from "@/lib/phoneBlacklist";
import { getSupabaseAdmin } from "@/lib/supabase";

function isValidMobile(digits: string): boolean {
  return /^010\d{8}$/.test(digits);
}

export async function GET() {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_blacklist")
    .select("id, name, phone, normalized_phone, memo, is_active, created_by_name, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("GET lead_blacklist:", error);
    return NextResponse.json(
      { ok: false, message: "블랙리스트를 불러오지 못했습니다. 마이그레이션 024를 적용했는지 확인해 주세요." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const digits = normalizePhoneDigits(String(body.phone ?? ""));
    const memoRaw = body.memo != null ? String(body.memo).trim() : "";
    const memo = memoRaw || null;

    if (!name) {
      return NextResponse.json({ ok: false, message: "고객 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!isValidMobile(digits)) {
      return NextResponse.json({ ok: false, message: "휴대폰번호는 010-0000-0000 형식이어야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const row = {
      name,
      phone: formatPhoneKorean(digits),
      normalized_phone: digits,
      memo,
      is_active: true,
      created_by: session.userId,
      created_by_name: session.name,
      updated_at: now,
    };

    const { data: existing } = await supabase
      .from("lead_blacklist")
      .select("id, is_active")
      .eq("normalized_phone", digits)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from("lead_blacklist")
        .update({
          name,
          phone: row.phone,
          memo,
          is_active: true,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("id, name, phone, normalized_phone, memo, is_active, created_by_name, created_at, updated_at")
        .single();
      if (error) {
        console.error("POST lead_blacklist update:", error);
        return NextResponse.json({ ok: false, message: "블랙리스트 갱신에 실패했습니다." }, { status: 500 });
      }
      return NextResponse.json({
        ok: true,
        item: data,
        message: existing.is_active ? "기존 블랙리스트 정보를 갱신했습니다." : "비활성 번호를 다시 활성화했습니다.",
      });
    }

    const { data, error } = await supabase
      .from("lead_blacklist")
      .insert(row)
      .select("id, name, phone, normalized_phone, memo, is_active, created_by_name, created_at, updated_at")
      .single();
    if (error) {
      console.error("POST lead_blacklist:", error);
      return NextResponse.json({ ok: false, message: "블랙리스트 등록에 실패했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: data, message: "블랙리스트에 등록했습니다." });
  } catch (e) {
    console.error("POST /api/admin/blacklist:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

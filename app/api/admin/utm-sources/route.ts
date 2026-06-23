import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeUtmSourceValue } from "@/lib/utmSourceMapping";

/**
 * GET /api/admin/utm-sources — UTM source 목록
 * POST /api/admin/utm-sources — UTM source 추가
 */
export async function GET() {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("utm_sources")
      .select("id, value, label, sheet_label, created_at")
      .order("label", { ascending: true });

    if (error) {
      console.error("GET utm_sources error:", error);
      return NextResponse.json({ ok: false, message: "목록 조회에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    console.error("GET /api/admin/utm-sources error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const value = normalizeUtmSourceValue(String(body.value ?? ""));
    const label = String(body.label ?? "").trim();
    const sheetLabel = String(body.sheet_label ?? label).trim();

    if (!value) {
      return NextResponse.json(
        { ok: false, message: "utm_source 값은 영문·숫자·_·- 만 64자 이내로 입력해 주세요." },
        { status: 400 }
      );
    }
    if (!label || label.length > 80) {
      return NextResponse.json(
        { ok: false, message: "표시 이름을 입력해 주세요. (80자 이내)" },
        { status: 400 }
      );
    }
    if (!sheetLabel || sheetLabel.length > 80) {
      return NextResponse.json(
        { ok: false, message: "시트 표시명을 입력해 주세요. (80자 이내)" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("utm_sources")
      .insert({ value, label, sheet_label: sheetLabel })
      .select("id, value, label, sheet_label, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, message: "이미 등록된 utm_source 값입니다." },
          { status: 409 }
        );
      }
      console.error("POST utm_sources error:", error);
      return NextResponse.json({ ok: false, message: "저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    console.error("POST /api/admin/utm-sources error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

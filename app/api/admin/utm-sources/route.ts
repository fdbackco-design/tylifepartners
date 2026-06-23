import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseUtmSourceInput, utmSourcesDbErrorMessage } from "@/lib/utmSourceMapping";

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
      return NextResponse.json(
        { ok: false, message: utmSourcesDbErrorMessage(error, "조회") },
        { status: 500 }
      );
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
    const parsed = parseUtmSourceInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
    }

    const { value, label, sheetLabel } = parsed.data;

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
      return NextResponse.json(
        { ok: false, message: utmSourcesDbErrorMessage(error, "저장") },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    console.error("POST /api/admin/utm-sources error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

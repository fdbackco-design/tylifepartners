import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  parseUtmSourceInput,
  utmSourcesDbErrorMessage,
} from "@/lib/utmSourceMapping";

/**
 * PATCH /api/admin/utm-sources/[id] — UTM source 수정
 * DELETE /api/admin/utm-sources/[id] — UTM source 삭제
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = parseUtmSourceInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
    }

    const { value, label, sheetLabel } = parsed.data;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("utm_sources")
      .update({ value, label, sheet_label: sheetLabel })
      .eq("id", id)
      .select("id, value, label, sheet_label, created_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, message: "이미 등록된 utm_source 값입니다." },
          { status: 409 }
        );
      }
      console.error("PATCH utm_sources error:", error);
      return NextResponse.json(
        { ok: false, message: utmSourcesDbErrorMessage(error, "수정") },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "해당 utm_source를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    console.error("PATCH /api/admin/utm-sources/[id] error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("utm_sources")
      .delete()
      .eq("id", id)
      .select("id, value")
      .maybeSingle();

    if (error) {
      console.error("DELETE utm_sources error:", error);
      return NextResponse.json(
        { ok: false, message: utmSourcesDbErrorMessage(error, "삭제") },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "해당 utm_source를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    console.error("DELETE /api/admin/utm-sources/[id] error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

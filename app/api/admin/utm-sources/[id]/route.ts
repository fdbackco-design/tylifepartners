import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  parseUtmSourceInput,
  utmSourcesDbErrorMessage,
} from "@/lib/utmSourceMapping";

async function usageCount(supabase: ReturnType<typeof getSupabaseAdmin>, value: string): Promise<number> {
  const [a, b] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("utm_source", value),
    supabase.from("tylife_b2b").select("id", { count: "exact", head: true }).eq("utm_source", value),
  ]);
  return (a.count ?? 0) + (b.count ?? 0);
}

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
    const supabase = getSupabaseAdmin();

    if (body.is_active != null && body.value == null && body.label == null) {
      const { data, error } = await supabase
        .from("utm_sources")
        .update({ is_active: Boolean(body.is_active) })
        .eq("id", id)
        .select("id, value, label, sheet_label, created_at, is_active")
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          { ok: false, message: "비활성 컬럼이 없습니다. 마이그레이션 020을 적용해 주세요." },
          { status: 500 }
        );
      }
      if (!data) {
        return NextResponse.json({ ok: false, message: "해당 utm_source를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, item: data });
    }

    const parsed = parseUtmSourceInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
    }

    const { value, label, sheetLabel } = parsed.data;
    const patch: Record<string, unknown> = { value, label, sheet_label: sheetLabel };
    if (body.is_active != null) patch.is_active = Boolean(body.is_active);

    const { data, error } = await supabase
      .from("utm_sources")
      .update(patch)
      .eq("id", id)
      .select("id, value, label, sheet_label, created_at, is_active")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, message: "이미 등록된 utm_source 값입니다." },
          { status: 409 }
        );
      }
      // fallback without is_active
      const retry = await supabase
        .from("utm_sources")
        .update({ value, label, sheet_label: sheetLabel })
        .eq("id", id)
        .select("id, value, label, sheet_label, created_at")
        .maybeSingle();
      if (retry.error) {
        if (retry.error.code === "23505") {
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
      if (!retry.data) {
        return NextResponse.json({ ok: false, message: "해당 utm_source를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, item: { ...retry.data, is_active: true } });
    }

    if (!data) {
      return NextResponse.json({ ok: false, message: "해당 utm_source를 찾을 수 없습니다." }, { status: 404 });
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
    const { data: existing } = await supabase
      .from("utm_sources")
      .select("id, value")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: false, message: "해당 utm_source를 찾을 수 없습니다." }, { status: 404 });
    }

    // 리드/B2B에 남은 utm_source 문자열은 유지됩니다. 카탈로그만 제거합니다.
    const used = await usageCount(supabase, existing.value);

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

    return NextResponse.json({
      ok: true,
      item: data,
      used,
      message:
        used > 0
          ? `소스를 삭제했습니다. 기존 고객 ${used}건의 utm_source 값은 그대로 유지됩니다.`
          : "소스가 삭제되었습니다.",
    });
  } catch (e) {
    console.error("DELETE /api/admin/utm-sources/[id] error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

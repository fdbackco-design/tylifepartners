import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseUtmSourceInput, utmSourcesDbErrorMessage } from "@/lib/utmSourceMapping";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("utm_sources")
      .select("id, value, label, sheet_label, created_at, is_active")
      .order("label", { ascending: true });

    if (error) {
      // is_active 컬럼 없을 때 폴백
      const fallback = await supabase
        .from("utm_sources")
        .select("id, value, label, sheet_label, created_at")
        .order("label", { ascending: true });
      if (fallback.error) {
        console.error("GET utm_sources error:", error);
        return NextResponse.json(
          { ok: false, message: utmSourcesDbErrorMessage(error, "조회") },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        items: (fallback.data ?? []).map((r) => ({ ...r, is_active: true })),
      });
    }

    return NextResponse.json({
      ok: true,
      items: (data ?? []).map((r) => ({ ...r, is_active: r.is_active !== false })),
    });
  } catch (e) {
    console.error("GET /api/admin/utm-sources error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
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
      .insert({ value, label, sheet_label: sheetLabel, is_active: true })
      .select("id, value, label, sheet_label, created_at, is_active")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, message: "이미 등록된 utm_source 값입니다." },
          { status: 409 }
        );
      }
      // is_active 없이 재시도
      const retry = await supabase
        .from("utm_sources")
        .insert({ value, label, sheet_label: sheetLabel })
        .select("id, value, label, sheet_label, created_at")
        .single();
      if (retry.error) {
        if (retry.error.code === "23505") {
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
      const item = { ...retry.data, is_active: true };
      void writeAdminAudit({
        actor: actorFromSession(session),
        action: "utm.create",
        resourceType: "utm_source",
        resourceId: retry.data.id,
        summary: `UTM 소스 등록: ${retry.data.label} (${retry.data.value})`,
        detail: { value: retry.data.value, label: retry.data.label, sheet_label: retry.data.sheet_label },
        request,
      });
      return NextResponse.json({ ok: true, item });
    }

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "utm.create",
      resourceType: "utm_source",
      resourceId: data.id,
      summary: `UTM 소스 등록: ${data.label} (${data.value})`,
      detail: { value: data.value, label: data.label, sheet_label: data.sheet_label },
      request,
    });

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    console.error("POST /api/admin/utm-sources error:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

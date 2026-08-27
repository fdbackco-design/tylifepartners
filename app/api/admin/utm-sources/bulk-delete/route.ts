import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";
import { utmSourcesDbErrorMessage } from "@/lib/utmSourceMapping";

async function usageCount(supabase: ReturnType<typeof getSupabaseAdmin>, value: string): Promise<number> {
  const [a, b] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("utm_source", value),
    supabase.from("tylife_b2b").select("id", { count: "exact", head: true }).eq("utm_source", value),
  ]);
  return (a.count ?? 0) + (b.count ?? 0);
}

/**
 * POST /api/admin/utm-sources/bulk-delete
 * body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)))
      : [];

    if (!ids.length) {
      return NextResponse.json({ ok: false, message: "선택된 항목이 없습니다." }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ ok: false, message: "한 번에 100개까지 삭제할 수 있습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("utm_sources")
      .select("id, value, label")
      .in("id", ids);

    if (error) {
      console.error("bulk-delete utm_sources load:", error);
      return NextResponse.json(
        { ok: false, message: utmSourcesDbErrorMessage(error, "조회") },
        { status: 500 }
      );
    }

    const found = rows ?? [];
    if (!found.length) {
      return NextResponse.json({ ok: false, message: "삭제할 소스를 찾을 수 없습니다." }, { status: 404 });
    }

    let deleted = 0;
    const blocked: { id: string; label: string; value: string; used: number }[] = [];
    const deletedValues: string[] = [];

    for (const row of found) {
      const used = await usageCount(supabase, row.value);
      if (used > 0) {
        blocked.push({ id: row.id, label: row.label, value: row.value, used });
        continue;
      }
      const { error: delErr } = await supabase.from("utm_sources").delete().eq("id", row.id);
      if (delErr) {
        console.error("bulk-delete utm_sources:", delErr);
        continue;
      }
      deleted += 1;
      deletedValues.push(row.value);
    }

    if (!deleted && blocked.length) {
      return NextResponse.json(
        {
          ok: false,
          message: `선택한 소스가 고객 데이터에서 사용 중입니다. 삭제 대신 비활성화를 사용해 주세요.`,
          deleted: 0,
          blocked,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted,
      blocked,
      deleted_values: deletedValues,
      message:
        blocked.length > 0
          ? `${deleted}개 삭제, ${blocked.length}개는 사용 중이라 제외되었습니다.`
          : `${deleted}개 소스를 삭제했습니다.`,
    });
  } catch (e) {
    console.error("POST /api/admin/utm-sources/bulk-delete:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

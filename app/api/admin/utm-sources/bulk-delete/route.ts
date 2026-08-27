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
 *
 * 고객 데이터에서 사용 중이어도 카탈로그 삭제를 허용합니다.
 * 리드/B2B의 utm_source 문자열은 그대로 유지됩니다.
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
    let usedTotal = 0;
    const failed: { id: string; label: string; value: string }[] = [];
    const deletedValues: string[] = [];

    for (const row of found) {
      const used = await usageCount(supabase, row.value);
      const { error: delErr } = await supabase.from("utm_sources").delete().eq("id", row.id);
      if (delErr) {
        console.error("bulk-delete utm_sources:", delErr);
        failed.push({ id: row.id, label: row.label, value: row.value });
        continue;
      }
      deleted += 1;
      usedTotal += used;
      deletedValues.push(row.value);
    }

    if (!deleted) {
      return NextResponse.json(
        {
          ok: false,
          message: "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          deleted: 0,
          failed,
        },
        { status: 500 }
      );
    }

    const parts = [`${deleted}개 소스를 삭제했습니다.`];
    if (usedTotal > 0) {
      parts.push(`기존 고객 데이터의 utm_source 값은 그대로 유지됩니다.`);
    }
    if (failed.length > 0) {
      parts.push(`${failed.length}개는 삭제하지 못했습니다.`);
    }

    return NextResponse.json({
      ok: true,
      deleted,
      failed,
      used_total: usedTotal,
      deleted_values: deletedValues,
      message: parts.join(" "),
    });
  } catch (e) {
    console.error("POST /api/admin/utm-sources/bulk-delete:", e);
    return NextResponse.json({ ok: false, message: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

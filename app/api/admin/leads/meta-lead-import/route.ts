import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { executeMetaLeadCsvImport, previewMetaLeadCsvImport } from "@/lib/crm/metaLeadCsvImport";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";

/**
 * POST /api/admin/leads/meta-lead-import
 * Meta Ads Manager Lead CSV → 후보자 DB(tylife_b2b)
 * multipart: file, mode=preview|execute
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 업로드할 수 있습니다." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "preview");
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "CSV 파일이 필요합니다." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ ok: false, message: "파일은 8MB 이하여야 합니다." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (mode === "execute") {
      const confirm = String(form.get("confirm") ?? "") === "true";
      if (!confirm) {
        return NextResponse.json({ ok: false, message: "confirm=true 가 필요합니다." }, { status: 400 });
      }
      const result = await executeMetaLeadCsvImport(buf);
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      void writeAdminAudit({
        actor: actorFromSession(session),
        action: "lead.meta_csv_import",
        resourceType: "lead",
        summary: `Meta Lead CSV 후보자 반영 (신규 ${result.summary.inserted}, 갱신 ${result.summary.updated})`,
        detail: {
          file_name: file.name,
          inserted: result.summary.inserted,
          updated: result.summary.updated,
          failed: result.summary.failed,
          skipped: result.summary.skipped,
        },
        request,
      });
      return NextResponse.json(result);
    }

    const preview = await previewMetaLeadCsvImport(buf);
    if (!preview.ok) {
      return NextResponse.json(preview, { status: 400 });
    }
    return NextResponse.json(preview);
  } catch (e) {
    console.error("meta-lead-import:", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "업로드 처리 중 오류" },
      { status: 500 }
    );
  }
}

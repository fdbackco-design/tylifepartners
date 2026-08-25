import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { buildExcelImportPreview, executeExcelImport } from "@/lib/crm/excelImport/service";
import { buildResultWorkbook } from "@/lib/crm/excelImport/parse";
import { getSupabaseAdmin } from "@/lib/supabase";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const mode = String(form.get("mode") ?? "preview");
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "file 필드가 필요합니다." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());

    if (mode === "preview") {
      const preview = await buildExcelImportPreview(buf);
      const supabase = getSupabaseAdmin();
      const { data: job } = await supabase
        .from("lead_excel_import_jobs")
        .insert({
          lead_table: "all",
          mode: "dry_run",
          status: "completed",
          file_name: file.name,
          uploaded_at: preview.upload_at,
          executed_by: session.userId,
          executed_by_name: session.name,
          summary: preview.summary,
          finished_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      return NextResponse.json({ ok: true, job_id: job?.id ?? null, ...preview });
    }

    if (mode === "execute") {
      const confirm = String(form.get("confirm") ?? "") === "true";
      if (!confirm) {
        return NextResponse.json({ ok: false, message: "confirm=true 가 필요합니다." }, { status: 400 });
      }
      const result = await executeExcelImport({
        buffer: buf,
        session,
        fileName: file.name,
        confirm: true,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (mode === "result_file") {
      const jobId = String(form.get("job_id") ?? "");
      if (!jobId) return NextResponse.json({ ok: false, message: "job_id 필요" }, { status: 400 });
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("lead_excel_import_row_logs")
        .select("*")
        .eq("job_id", jobId)
        .order("excel_row_number", { ascending: true });
      const rows = (data ?? []).map((r) => ({
        엑셀행: r.excel_row_number,
        고객명: r.excel_name,
        연락처: r.normalized_phone,
        유입일: r.excel_inbound_date,
        대표고객ID: r.primary_lead_id,
        테이블: r.lead_table,
        상태: r.status,
        사유: (r.reasons ?? []).join(" | "),
        담당이력적용차수: (r.assignment_applied ?? []).join(","),
        담당이력건너뜀: (r.assignment_skipped ?? []).join(","),
        메모적용차수: (r.memo_applied ?? []).join(","),
        메모건너뜀: (r.memo_skipped ?? []).join(","),
      }));
      const xlsx = buildResultWorkbook(rows);
      return new NextResponse(new Uint8Array(xlsx), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="excel-import-result-${jobId.slice(0, 8)}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ ok: false, message: "unknown mode" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

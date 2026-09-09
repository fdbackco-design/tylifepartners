import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { parseTm001HotDbWorkbook } from "@/lib/crm/tm001/excel";
import { importTm001ExcelRows } from "@/lib/crm/tm001/store";

const MAX_BYTES = 20 * 1024 * 1024;

/** POST /api/admin/tm001/upload — multipart: file (차수는 자동 부여) */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 업로드할 수 있습니다." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "엑셀 파일이 필요합니다." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, message: "파일 크기는 1바이트~20MB여야 합니다." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseTm001HotDbWorkbook(buf);
    if (!parsed.rows.length) {
      return NextResponse.json(
        {
          ok: false,
          message: parsed.issues[0]?.message || "업로드할 숙박 행이 없습니다.",
          issues: parsed.issues.slice(0, 20),
          sheet: parsed.sheetName,
        },
        { status: 400 }
      );
    }

    const result = await importTm001ExcelRows({
      rows: parsed.rows,
      filename: file.name,
      uploadedBy: session.userId,
      uploadedByName: session.name,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      sheet: parsed.sheetName,
      parsed_rows: parsed.rows.length,
      unique_phones: parsed.uniquePhones,
      issues: parsed.issues.slice(0, 50),
      issue_count: parsed.issues.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/tm001_|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "TM001 테이블이 없습니다. Supabase에서 045_tm001_affiliate.sql 과 046_tm001_batch_phone_unique.sql 을 실행해 주세요.",
        },
        { status: 503 }
      );
    }
    console.error("POST /api/admin/tm001/upload:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

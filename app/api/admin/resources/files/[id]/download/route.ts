import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import {
  RESOURCE_SHARES_BUCKET,
  contentDispositionAttachment,
  getResourceFile,
} from "@/lib/crm/resourceShares";
import { getSupabaseAdmin } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/resources/files/[id]/download
 * Storage에서 파일을 읽어 한글 파일명(Content-Disposition UTF-8)으로 내려줍니다.
 * Windows에서도 파일명이 깨지지 않도록 filename* 를 사용합니다.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const file = await getResourceFile(id);
    if (!file) {
      return NextResponse.json({ ok: false, message: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(RESOURCE_SHARES_BUCKET)
      .download(file.storage_path);
    if (error || !data) {
      console.error("resource download:", error?.message);
      return NextResponse.json(
        { ok: false, message: error?.message || "파일 다운로드에 실패했습니다." },
        { status: 500 }
      );
    }

    const buf = await data.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": file.content_type || "application/octet-stream",
        "Content-Length": String(buf.byteLength),
        "Content-Disposition": contentDispositionAttachment(file.original_filename),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET resource file download:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

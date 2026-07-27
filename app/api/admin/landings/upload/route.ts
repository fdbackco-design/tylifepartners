import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "landing-assets";
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * POST /api/admin/landings/upload
 * multipart: file
 * → Supabase Storage public URL
 *
 * Supabase에 `landing-assets` 버킷을 public으로 생성해 주세요.
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "파일이 필요합니다." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: "파일 크기는 1바이트~15MB여야 합니다." },
        { status: 400 }
      );
    }

    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ext || "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (error) {
      console.error("landing upload error:", error.message);
      return NextResponse.json(
        {
          ok: false,
          message: `업로드 실패: ${error.message}. Supabase Storage에 '${BUCKET}' public 버킷이 있는지 확인하세요.`,
        },
        { status: 500 }
      );
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, url: data.publicUrl, path });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/admin/landings/upload:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

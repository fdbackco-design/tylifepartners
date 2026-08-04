import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/adminSession";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "landing-assets";
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * POST /api/admin/landings/upload
 * JSON: { filename, contentType?, size }
 * → signed upload URL (클라이언트가 Supabase에 직접 PUT)
 *
 * 서버를 경유하지 않아 Vercel/프록시 Request Entity Too Large를 피합니다.
 * Supabase에 `landing-assets` 버킷을 public으로 생성해 주세요.
 */
export async function POST(request: NextRequest) {
  const valid = await verifyAdminSession();
  if (!valid) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      filename?: string;
      contentType?: string;
      size?: number;
    };

    const filename = String(body.filename ?? "").trim();
    const size = Number(body.size ?? 0);
    if (!filename) {
      return NextResponse.json({ ok: false, message: "파일명이 필요합니다." }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, message: "파일 크기는 1바이트~15MB여야 합니다." },
        { status: 400 }
      );
    }

    const ext = (filename.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeExt = ext || "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      const msg = error?.message || "서명 URL 발급 실패";
      console.error("landing signed upload url error:", msg);
      return NextResponse.json(
        {
          ok: false,
          message: `업로드 준비 실패: ${msg}. Supabase Storage에 '${BUCKET}' public 버킷이 있는지 확인하세요.`,
        },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path ?? path,
      publicUrl: publicData.publicUrl,
      contentType: body.contentType || "application/octet-stream",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/admin/landings/upload:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

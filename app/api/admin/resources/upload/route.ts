import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import {
  RESOURCE_MAX_BYTES,
  RESOURCE_SHARES_BUCKET,
  buildResourceStoragePath,
  sanitizeOriginalFilename,
} from "@/lib/crm/resourceShares";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/admin/resources/upload
 * JSON: { filename, contentType?, size }
 * → signed upload URL (클라이언트가 Storage에 직접 PUT)
 * Storage path는 ASCII만 사용. 원본 한글 파일명은 게시 시 DB에 저장.
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
    const body = (await request.json()) as {
      filename?: string;
      contentType?: string;
      size?: number;
    };

    const filename = sanitizeOriginalFilename(String(body.filename ?? "").trim());
    const size = Number(body.size ?? 0);
    if (!filename) {
      return NextResponse.json({ ok: false, message: "파일명이 필요합니다." }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > RESOURCE_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          message: `파일 크기는 1바이트~${Math.floor(RESOURCE_MAX_BYTES / (1024 * 1024))}MB여야 합니다.`,
        },
        { status: 400 }
      );
    }

    const path = buildResourceStoragePath(filename);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(RESOURCE_SHARES_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      const msg = error?.message || "서명 URL 발급 실패";
      console.error("resource signed upload url error:", msg);
      return NextResponse.json(
        {
          ok: false,
          message: `업로드 준비 실패: ${msg}. Supabase Storage에 '${RESOURCE_SHARES_BUCKET}' public 버킷이 있는지 확인하세요.`,
        },
        { status: 500 }
      );
    }

    const { data: publicData } = supabase.storage.from(RESOURCE_SHARES_BUCKET).getPublicUrl(path);
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "resource.upload",
      resourceType: "resource",
      summary: `자료 파일 업로드 준비: ${filename}`,
      detail: { filename, path, size },
      request,
    });

    return NextResponse.json({
      ok: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path ?? path,
      publicUrl: publicData.publicUrl,
      originalFilename: filename,
      contentType: body.contentType || "application/octet-stream",
      maxBytes: RESOURCE_MAX_BYTES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/admin/resources/upload:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

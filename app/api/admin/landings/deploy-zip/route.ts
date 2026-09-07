import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { publishCodeZip } from "@/lib/managedLandings/codeZip/publish";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "landing-assets";

/** ZIP 언팩 + esbuild 번들 — 서버리스 한도 여유 */
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * POST /api/admin/landings/deploy-zip
 * JSON: { storagePath, path, title?, published?, replaceId? }
 * — 클라이언트가 ZIP을 Storage에 PUT한 뒤 호출
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      storagePath?: string;
      path?: string;
      title?: string;
      published?: boolean;
      replaceId?: string | null;
      sourceZipName?: string;
    };

    const storagePath = String(body.storagePath ?? "").trim();
    const path = String(body.path ?? "").trim();
    if (!storagePath) {
      return NextResponse.json({ ok: false, message: "storagePath가 필요합니다." }, { status: 400 });
    }
    if (!path) {
      return NextResponse.json({ ok: false, message: "배포 경로가 필요합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(storagePath);
    if (dlError || !blob) {
      return NextResponse.json(
        { ok: false, message: `ZIP 다운로드 실패: ${dlError?.message || "없음"}` },
        { status: 400 }
      );
    }

    const zipBytes = new Uint8Array(await blob.arrayBuffer());
    const result = await publishCodeZip({
      zipBytes,
      path,
      title: body.title,
      published: body.published,
      replaceId: body.replaceId,
      sourceZipName: body.sourceZipName,
    });

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "landing.deploy_zip",
      resourceType: "landing",
      resourceId: result.landing.id,
      summary: `코드 ZIP 배포: ${result.landing.path}`,
      detail: {
        path: result.landing.path,
        slug: result.landing.slug,
        storagePath,
        warnings: result.warnings,
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      landing: result.landing,
      warnings: result.warnings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("POST /api/admin/landings/deploy-zip:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

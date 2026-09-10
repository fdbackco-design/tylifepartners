import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { canAccessCrmLeads } from "@/lib/crm/scope";
import {
  RESOURCE_MAX_BYTES,
  createResourcePost,
  listResourcePosts,
} from "@/lib/crm/resourceShares";
import { notifyStaffResourceShare } from "@/lib/webPush";
import { runAfterResponse } from "@/lib/runAfterResponse";

/** GET /api/admin/resources — 전체 직원 열람 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (!canAccessCrmLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  try {
    const items = await listResourcePosts();
    return NextResponse.json({
      ok: true,
      items,
      can_write: session.rank === "admin",
      max_bytes: RESOURCE_MAX_BYTES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/resource_posts|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "자료 공유 테이블이 없습니다. Supabase에서 supabase/migrations/043_resource_shares.sql 을 실행해 주세요.",
        },
        { status: 503 }
      );
    }
    console.error("GET /api/admin/resources:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

/** POST /api/admin/resources — 관리자만 작성 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 자료를 등록할 수 있습니다." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      files?: Array<{
        storage_path?: string;
        public_url?: string | null;
        original_filename?: string;
        content_type?: string | null;
        size_bytes?: number;
      }>;
    };

    const files = Array.isArray(body.files)
      ? body.files
          .map((f) => ({
            storage_path: String(f.storage_path ?? "").trim(),
            public_url: f.public_url != null ? String(f.public_url) : null,
            original_filename: String(f.original_filename ?? "").trim(),
            content_type: f.content_type != null ? String(f.content_type) : null,
            size_bytes: Number(f.size_bytes ?? 0),
          }))
          .filter((f) => f.storage_path && f.original_filename)
      : [];

    for (const f of files) {
      if (!Number.isFinite(f.size_bytes) || f.size_bytes < 0 || f.size_bytes > RESOURCE_MAX_BYTES) {
        return NextResponse.json(
          { ok: false, message: `첨부 파일 용량이 허용 범위를 초과했습니다 (${f.original_filename}).` },
          { status: 400 }
        );
      }
    }

    const item = await createResourcePost({
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      createdBy: session.userId,
      createdByName: session.name,
      files,
    });

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "resource.create",
      resourceType: "resource",
      resourceId: item.id,
      summary: `자료 공유 등록: ${item.title}`,
      detail: { title: item.title, file_count: item.files.length },
      request,
    });

    runAfterResponse(
      notifyStaffResourceShare({
        postId: item.id,
        title: item.title,
        authorName: item.created_by_name,
        fileCount: item.files.length,
      }).catch((e) => console.error("resource share push:", e))
    );

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/resource_posts|schema cache|does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "자료 공유 테이블이 없습니다. Supabase에서 supabase/migrations/043_resource_shares.sql 을 실행해 주세요.",
        },
        { status: 503 }
      );
    }
    console.error("POST /api/admin/resources:", msg);
    const status = /제목|내용|입력/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }
}

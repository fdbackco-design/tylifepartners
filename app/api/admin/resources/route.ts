import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { canAccessCrmLeads } from "@/lib/crm/scope";
import {
  RESOURCE_MAX_BYTES,
  RESOURCE_PRODUCT_TAGS,
  RESOURCE_SITUATION_TAGS,
  RESOURCE_STATUS_TAGS,
  createResourcePost,
  listResourcePosts,
} from "@/lib/crm/resourceShares";
import { notifyStaffResourceShare } from "@/lib/webPush";
import { runAfterResponse } from "@/lib/runAfterResponse";

function parseFiles(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const row = f as Record<string, unknown>;
      return {
        storage_path: String(row.storage_path ?? "").trim(),
        public_url: row.public_url != null ? String(row.public_url) : null,
        original_filename: String(row.original_filename ?? "").trim(),
        content_type: row.content_type != null ? String(row.content_type) : null,
        size_bytes: Number(row.size_bytes ?? 0),
      };
    })
    .filter((f) => f.storage_path && f.original_filename);
}

function migrationHint(msg: string): string | null {
  if (/product_tags|status_tags|situation_tags|schema cache/i.test(msg)) {
    return "자료 태그 컬럼이 없습니다. Supabase에서 supabase/migrations/056_resource_post_tags.sql 및 057_resource_status_tags.sql 을 실행해 주세요.";
  }
  if (/resource_posts|does not exist/i.test(msg)) {
    return "자료 공유 테이블이 없습니다. Supabase에서 supabase/migrations/043_resource_shares.sql 을 실행해 주세요.";
  }
  return null;
}

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
      product_tags: [...RESOURCE_PRODUCT_TAGS],
      status_tags: [...RESOURCE_STATUS_TAGS],
      situation_tags: [...RESOURCE_SITUATION_TAGS],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = migrationHint(msg);
    if (hint) {
      return NextResponse.json({ ok: false, message: hint }, { status: 503 });
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
    const body = (await request.json()) as Record<string, unknown>;
    const files = parseFiles(body.files);

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
      productTags: body.product_tags as string[] | undefined,
      statusTags: body.status_tags as string[] | undefined,
      situationTags: body.situation_tags as string[] | undefined,
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
      detail: {
        title: item.title,
        file_count: item.files.length,
        product_tags: item.product_tags,
        status_tags: item.status_tags,
        situation_tags: item.situation_tags,
      },
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
    const hint = migrationHint(msg);
    if (hint) {
      return NextResponse.json({ ok: false, message: hint }, { status: 503 });
    }
    console.error("POST /api/admin/resources:", msg);
    const status = /제목|내용|입력/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }
}

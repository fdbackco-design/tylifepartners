import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { canAccessCrmLeads } from "@/lib/crm/scope";
import {
  RESOURCE_MAX_BYTES,
  deleteResourcePost,
  getResourcePost,
  updateResourcePost,
} from "@/lib/crm/resourceShares";

type Ctx = { params: Promise<{ id: string }> };

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

/** GET /api/admin/resources/[id] — 상세 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (!canAccessCrmLeads(session)) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
  }

  try {
    const item = await getResourcePost(id);
    if (!item) {
      return NextResponse.json({ ok: false, message: "자료를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item, can_write: session.rank === "admin" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("GET /api/admin/resources/[id]:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

/** PATCH /api/admin/resources/[id] — 관리자만 수정 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 수정할 수 있습니다." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const filesToAdd = parseFiles(body.files);
    for (const f of filesToAdd) {
      if (!Number.isFinite(f.size_bytes) || f.size_bytes < 0 || f.size_bytes > RESOURCE_MAX_BYTES) {
        return NextResponse.json(
          { ok: false, message: `첨부 파일 용량이 허용 범위를 초과했습니다 (${f.original_filename}).` },
          { status: 400 }
        );
      }
    }

    const item = await updateResourcePost(id, {
      title: String(body.title ?? ""),
      body: String(body.body ?? ""),
      productTags: body.product_tags as string[] | undefined,
      statusTags: body.status_tags as string[] | undefined,
      situationTags: body.situation_tags as string[] | undefined,
      filesToAdd,
    });

    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "resource.update",
      resourceType: "resource",
      resourceId: item.id,
      summary: `자료 공유 수정: ${item.title}`,
      detail: {
        title: item.title,
        file_count: item.files.length,
        product_tags: item.product_tags,
        status_tags: item.status_tags,
        situation_tags: item.situation_tags,
      },
      request,
    });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("PATCH /api/admin/resources/[id]:", msg);
    const status = /제목|내용|입력|찾을 수 없/i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }
}

/** DELETE /api/admin/resources/[id] — 관리자만 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "관리자만 삭제할 수 있습니다." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
  }

  try {
    await deleteResourcePost(id);
    void writeAdminAudit({
      actor: actorFromSession(session),
      action: "resource.delete",
      resourceType: "resource",
      resourceId: id,
      summary: `자료 공유 삭제: ${id}`,
      request,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("DELETE /api/admin/resources/[id]:", msg);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

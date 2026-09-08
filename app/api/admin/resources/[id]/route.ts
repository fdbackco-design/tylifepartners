import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { deleteResourcePost } from "@/lib/crm/resourceShares";

type Ctx = { params: Promise<{ id: string }> };

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

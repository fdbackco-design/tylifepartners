import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { bulkAssignTm002 } from "@/lib/crm/tm002/store";
import { canChangeTm002Assignee } from "@/lib/crm/scope";

/** POST /api/admin/tm002/bulk-assign */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  if (!canChangeTm002Assignee(session)) {
    return NextResponse.json({ ok: false, message: "담당자를 변경할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { ids?: string[]; assignee_id?: string | null };
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    if (!ids.length) {
      return NextResponse.json({ ok: false, message: "선택된 고객이 없습니다." }, { status: 400 });
    }
    const result = await bulkAssignTm002(ids, body.assignee_id ?? null, session);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: /권한/.test(msg) ? 403 : 400 });
  }
}

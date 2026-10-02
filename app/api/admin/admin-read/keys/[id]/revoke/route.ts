import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { revokeAdminReadApiKey } from "@/lib/adminRead/keysAdmin";

/** POST /api/admin/admin-read/keys/[id]/revoke */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "인증이 필요합니다." }, { status: 401 });
  }
  if (session.rank !== "admin") {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const keyId = String(params.id ?? "").trim();
  if (!keyId) {
    return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
  }

  try {
    await revokeAdminReadApiKey(keyId);
    await writeAdminAudit({
      actor: actorFromSession(session),
      action: "admin_read_key.revoke",
      resourceType: "admin_read_api_key",
      resourceId: keyId,
      summary: "관리자 읽기 API 키 폐기",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

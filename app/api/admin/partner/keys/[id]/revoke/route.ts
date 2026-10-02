import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/adminSession";
import { actorFromSession, writeAdminAudit } from "@/lib/crm/adminAudit";
import { revokePartnerApiKey } from "@/lib/partner/keysAdmin";

/** POST /api/admin/partner/keys/[id]/revoke */
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
    await revokePartnerApiKey(keyId);
    await writeAdminAudit({
      actor: actorFromSession(session),
      action: "partner_key.revoke",
      resourceType: "partner_api_key",
      resourceId: keyId,
      summary: "파트너 API 키 폐기",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
